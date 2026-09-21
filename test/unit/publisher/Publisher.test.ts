import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	arrayBufferToBase64,
	base64ToArrayBuffer,
	Platform,
	type TFile,
} from "obsidian";
import { createHash } from "node:crypto";
import { Publisher } from "src/publisher/Publisher";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import type { GitBackend, TreeEntry } from "src/git/types";
import { PublishFile } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type QuartzSyncer from "src/main";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore, type QuartzSyncerCache } from "src/cache/DataStore";
import type { IndexedDBStore } from "src/cache/IndexedDBStore";
import {
	DYNAMIC_CONTENT_DETECTOR_VERSION,
	settingsFingerprint,
} from "src/cache/CompiledEntryValidity";
import type { AssetSyncResult } from "src/compiler/integrations/AssetSyncer";
import { generateBlobHash } from "src/utils/utils";
import {
	flattenLinkedMedia,
	resolveLinkedMedia,
	resolveLinkedMediaByFile,
} from "src/publisher/MediaLinkResolver";

const resolveLinkedMediaMock = vi.hoisted(() => vi.fn());
const collectAssetsMock = vi.hoisted(() => vi.fn());

vi.mock("src/cli/handlers/cliUtils", () => ({
	createRepositoryAdapter: () => ({}),
}));

vi.mock("src/compiler/integrations/AssetSyncer", () => ({
	AssetSyncer: class {
		collectAssets = collectAssetsMock;
	},
}));

vi.mock("src/publisher/MediaLinkResolver", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("src/publisher/MediaLinkResolver")
		>();

	return {
		...actual,
		resolveLinkedMedia: resolveLinkedMediaMock,
		resolveLinkedMediaByFile: vi.fn(actual.resolveLinkedMediaByFile),
	};
});

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	settingsSchemaVersion: 2,
	publishTarget: "remote",
	gitRemoteUrl: "",
	gitBranch: "main",
	gitCorsProxyUrl: "",
	gitAuthType: "none",
	gitAuthUsername: "",
	gitProviderHint: "github",
	vaultPath: "/",
	contentFolder: "content",
	publishFrontmatterKey: "publish",
	allNotesPublishableByDefault: false,
	showCreatedTimestamp: false,
	showUpdatedTimestamp: false,
	showPublishedTimestamp: false,
	usePermalink: false,
	includeAllFrontmatter: false,
	frontmatterFormat: "yaml",
	createdTimestampKey: "created",
	updatedTimestampKey: "updated",
	publishedTimestampKey: "published",
	timestampFormat: "YYYY-MM-DD",
	useCache: true,
	autoCleanOrphanedMedia: false,
	syncCache: false,
	persistCache: false,
	cacheTimestamp: 0,
	cache: "{}",
	useAutoCardLink: false,
	useDataview: false,
	useDatacore: false,
	useFantasyStatblocks: false,
	useBases: false,
	useCanvas: false,
	useExcalidraw: false,
	manageSyncerStyles: false,
	noteSettingsIsInitialized: false,
	lastUsedSettingsTab: "",
	pluginVersion: "0.0.0",
	lastUpstreamCommitSha: "",
	upgradeCheckStrategy: "version",
	diffViewStyle: "auto",
	diffContextLines: 3,
	allowArbitraryFilePublishing: false,
	arbitraryPublishPaths: [],
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: false,
	...overrides,
});

const makePlugin = (
	settings: QuartzSyncerSettings,
	supportsV5Management = false,
): QuartzSyncer =>
	({
		settings,
		saveSettings: vi.fn(),
		quartzCompatibility: {
			supportsV5Management: vi
				.fn()
				.mockResolvedValue(supportsV5Management),
			isConfirmedV4: vi.fn().mockResolvedValue(false),
			getVersion: vi.fn().mockResolvedValue("unknown"),
			invalidate: vi.fn(),
		},
		statusCache: {
			invalidate: vi.fn(),
			markStale: vi.fn(),
			markStaleFile: vi.fn(),
			clearDiffCache: vi.fn(),
			patchPublished: vi.fn(),
			patchDeleted: vi.fn(),
		},
	}) as unknown as QuartzSyncer;

const makeGitBackend = (overrides: Partial<GitBackend> = {}): GitBackend =>
	({
		writeFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
		deleteFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
		readTree: vi.fn().mockResolvedValue([]),
		readBlob: vi.fn(),
		getRemoteInfo: vi.fn(),
		testConnection: vi.fn(),
		listBranches: vi.fn(),
		...overrides,
	}) as unknown as GitBackend;

const makePublishFile = (path: string): PublishFile =>
	({
		file: { path, stat: { mtime: 1000 } },
		getVaultPath: () => path,
	}) as PublishFile;

describe("Publisher", () => {
	beforeEach(() => {
		vi.mocked(resolveLinkedMedia).mockResolvedValue(new Set());
		vi.mocked(resolveLinkedMediaByFile).mockClear();
	});

	it("publishBatch calls writeFiles with compiled content", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHashes: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const file = makePublishFile("notes/a.md");
		await publisher.publishBatch([file]);

		expect(gitBackend.writeFiles).toHaveBeenCalledWith(
			"main",
			"Publish notes",
			[
				{
					path: "content/notes/a.md",
					content: "hello",
					encoding: "utf-8",
				},
			],
		);
	});

	it("stops resolving dynamic notes as soon as the caller aborts", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true, useDataview: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const dataStore = new DataStore(
			"abort-vault",
			"plugin",
			"1.0.0",
			"",
			() => settings,
		);
		const compiler = {
			generateMarkdown: vi.fn().mockResolvedValue(["out", { blobs: [] }]),
			generateMarkdownWithEvidence: vi.fn().mockResolvedValue({
				compiledFile: ["out", { blobs: [] }],
				successfulVaultDependentExecutions: new Set<string>(),
			}),
			extractBlobLinks: vi.fn().mockResolvedValue([]),
		} as unknown as SyncerPageCompiler;

		const makeDynamic = (path: string) =>
			({
				getVaultPath: () => path,
				file: {
					path,
					stat: { mtime: 1000 },
				},
				compile: vi.fn().mockResolvedValue({
					getCompiledFile: () => ["out", { blobs: [] }],
				}),
			}) as unknown as PublishFile;

		const publisher = new Publisher(
			app,
			plugin,
			new RemotePublishBackend(gitBackend, "main"),
			compiler,
			dataStore,
		);

		const controller = new AbortController();
		const resolved: string[] = [];

		await publisher.resolveDynamicClassification(
			[makeDynamic("a.md"), makeDynamic("b.md"), makeDynamic("c.md")],
			(vaultPath) => {
				resolved.push(vaultPath);
				controller.abort();
			},
			controller.signal,
		);

		expect(resolved).toEqual(["a.md"]);
	});

	it("compiles a dynamic note once across diff and publish in one session", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true, useDataview: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const note = {
			path: "notes/dynamic.md",
			name: "dynamic.md",
			extension: "md",
			stat: { mtime: 1000, ctime: 1000, size: 32 },
		} as TFile;
		app.vault.cachedRead = vi
			.fn()
			.mockResolvedValue("```dataview\nLIST\n```");
		app.metadataCache.getCache = vi.fn().mockReturnValue({
			frontmatter: { publish: true },
		});
		const dataStore = new DataStore(
			"session-reuse-vault",
			"plugin",
			"1.0.0",
			"",
			() => settings,
			() => ({ dataviewRevision: 42, datacoreRevision: undefined }),
		);
		const cache = new Map<string, unknown>();
		dataStore.persister = {
			getItem: async <T>(key: string) =>
				(cache.get(key) as T | undefined) ?? null,
			getMany: async <T>(keys: string[]) =>
				keys.map((key) => (cache.get(key) as T | undefined) ?? null),
			setItem: async <T>(key: string, value: T) => {
				cache.set(key, value);
			},
			setMany: async <T>(entries: Array<{ key: string; value: T }>) => {
				for (const { key, value } of entries) cache.set(key, value);
			},
			removeItem: async (key: string) => {
				cache.delete(key);
			},
			keys: async () => [...cache.keys()],
			iterate: async <T>(callback: (value: T, key: string) => void) => {
				for (const [key, value] of cache) callback(value as T, key);
			},
			close: () => undefined,
		} satisfies IndexedDBStore;
		const compiler = {
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["fresh output", { blobs: [] }]),
			generateMarkdownWithEvidence: vi.fn().mockResolvedValue({
				compiledFile: ["fresh output", { blobs: [] }],
				successfulVaultDependentExecutions: new Set(["dataview"]),
			}),
			extractBlobLinks: vi.fn().mockResolvedValue([]),
		} as unknown as SyncerPageCompiler;
		const file = new PublishFile({
			file: note,
			vault: app.vault,
			metadataCache: app.metadataCache,
			settings,
			compiler,
			datastore: dataStore,
		});
		const previousApp = window.app;
		Object.assign(window, {
			app: { plugins: { plugins: { dataview: { settings: {} } } } },
		});

		try {
			const publisher = new Publisher(
				app,
				plugin,
				new RemotePublishBackend(gitBackend, "main"),
				compiler,
				dataStore,
			);

			publisher.beginDynamicSession();

			const diffContent = await publisher.getLocalCompiledContent(file);
			const result = await publisher.publishBatch([file]);

			expect(diffContent).toBe("fresh output");
			expect(result.success).toBe(true);
			expect(
				compiler.generateMarkdownWithEvidence,
			).toHaveBeenCalledOnce();

			publisher.endDynamicSession();
			expect(publisher.dynamicSessionSize).toBe(0);
		} finally {
			Object.assign(window, { app: previousApp });
		}
	});

	it("foreground publish preserves current dynamic compilation revisions", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true, useDataview: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const note = {
			path: "notes/dynamic.md",
			name: "dynamic.md",
			extension: "md",
			stat: { mtime: 1000, ctime: 1000, size: 32 },
		} as TFile;
		app.vault.cachedRead = vi
			.fn()
			.mockResolvedValue("```dataview\nLIST\n```");
		app.metadataCache.getCache = vi.fn().mockReturnValue({
			frontmatter: { publish: true },
		});
		const dataStore = new DataStore(
			"foreground-revision-vault",
			"plugin",
			"1.0.0",
			"",
			() => settings,
			() => ({ dataviewRevision: 42, datacoreRevision: undefined }),
		);
		const cache = new Map<string, unknown>();
		dataStore.persister = {
			getItem: async <T>(key: string) =>
				(cache.get(key) as T | undefined) ?? null,
			getMany: async <T>(keys: string[]) =>
				keys.map((key) => (cache.get(key) as T | undefined) ?? null),
			setItem: async <T>(key: string, value: T) => {
				cache.set(key, value);
			},
			setMany: async <T>(entries: Array<{ key: string; value: T }>) => {
				for (const { key, value } of entries) cache.set(key, value);
			},
			removeItem: async (key: string) => {
				cache.delete(key);
			},
			keys: async () => [...cache.keys()],
			iterate: async <T>(callback: (value: T, key: string) => void) => {
				for (const [key, value] of cache) callback(value as T, key);
			},
			close: () => undefined,
		} satisfies IndexedDBStore;
		await dataStore.persister.setItem("file:notes/dynamic.md", {
			version: "1.0.0",
			time: 900,
			sourceMtime: 1000,
			settingsFingerprint: settingsFingerprint(settings),
			detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
			dynamicSources: ["dataview"],
			dataviewRevision: 42,
		} satisfies QuartzSyncerCache);
		const compiler = {
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["fresh output", { blobs: [] }]),
			generateMarkdownWithEvidence: vi.fn().mockResolvedValue({
				compiledFile: ["fresh output", { blobs: [] }],
				successfulVaultDependentExecutions: new Set(["dataview"]),
			}),
			extractBlobLinks: vi.fn().mockResolvedValue([]),
		} as unknown as SyncerPageCompiler;
		const file = new PublishFile({
			file: note,
			vault: app.vault,
			metadataCache: app.metadataCache,
			settings,
			compiler,
			datastore: dataStore,
		});
		const previousApp = window.app;
		Object.assign(window, {
			app: { plugins: { plugins: { dataview: { settings: {} } } } },
		});

		try {
			const publisher = new Publisher(
				app,
				plugin,
				new RemotePublishBackend(gitBackend, "main"),
				compiler,
				dataStore,
			);
			const result = await publisher.publishBatch([file]);
			const persisted = (await dataStore.exportCache())[
				"file:notes/dynamic.md"
			];

			expect(result.success).toBe(true);
			expect(
				compiler.generateMarkdownWithEvidence,
			).toHaveBeenCalledOnce();
			expect(persisted).toMatchObject({
				dynamicSources: ["dataview"],
				dataviewRevision: 42,
			});
		} finally {
			Object.assign(window, { app: previousApp });
		}
	});

	it("publishBatch does not store remote hash when writeFiles rejects", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			writeFiles: vi.fn().mockRejectedValue(new Error("push failed")),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHashes: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.publishBatch([makePublishFile("notes/a.md")]);

		expect(dataStore.storeRemoteHashes).not.toHaveBeenCalled();
	});

	it("publishBatch stores remote hashes in one batch after successful writeFiles", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			writeFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHashes: vi.fn(),
		} as unknown as DataStore;
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.publishBatch([
			makePublishFile("notes/a.md"),
			makePublishFile("notes/b.md"),
		]);

		expect(dataStore.storeRemoteHashes).toHaveBeenCalledExactlyOnceWith([
			{
				path: "notes/a.md",
				timestamp: 1234,
				hash: "sha-1",
				sourceMtime: 1000,
				currentMtime: 1000,
			},
			{
				path: "notes/b.md",
				timestamp: 1234,
				hash: "sha-1",
				sourceMtime: 1000,
				currentMtime: 1000,
			},
		]);

		const writeOrder = vi.mocked(gitBackend.writeFiles).mock
			.invocationCallOrder[0]!;
		const storeOrder = vi.mocked(dataStore.storeRemoteHashes).mock
			.invocationCallOrder[0]!;
		expect(writeOrder).toBeLessThan(storeOrder);

		nowSpy.mockRestore();
	});

	it("publishBatch refreshes tree cache", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHashes: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.publishBatch([makePublishFile("notes/a.md")]);

		expect(gitBackend.readTree).toHaveBeenCalledWith("main");
	});

	it("publishBatch patches status cache with published paths", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHashes: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.publishBatch([makePublishFile("notes/a.md")]);

		expect(plugin.statusCache.patchPublished).toHaveBeenCalledWith(
			new Set(["notes/a.md"]),
		);
	});

	describe("publishBatch media staging", () => {
		// Five bytes exercise base64 padding, NUL, and non-UTF-8 binary data.
		const bytes = new Uint8Array([0, 128, 255, 13, 10]);
		const content = arrayBufferToBase64(bytes.buffer);
		const sha = createHash("sha1")
			.update(Buffer.from(`blob ${bytes.byteLength}\0`))
			.update(Buffer.from(bytes))
			.digest("hex");
		const asset = {
			path: "/vault/images/photo.png",
			vaultPath: "/vault/images/photo.png",
		};
		const assetChange = {
			path: "site/images/photo.png",
			content,
			encoding: "base64",
		};
		const remoteAsset: TreeEntry = {
			path: assetChange.path,
			sha,
			type: "blob",
		};

		const setup = async (tree?: TreeEntry[]) => {
			const gitBackend = makeGitBackend({
				readTree: vi.fn().mockResolvedValue(tree ?? []),
			});
			const backend = new RemotePublishBackend(gitBackend, "main");
			if (tree) await backend.refreshTreeCache();
			vi.mocked(gitBackend.readTree).mockClear();
			const dataStore = {
				loadLocalFile: vi
					.fn()
					.mockResolvedValue(["hello", { blobs: [asset] }]),
				loadLocalHash: vi.fn().mockResolvedValue(null),
				storeRemoteHashes: vi.fn(),
				loadAssetShas: vi.fn().mockResolvedValue(new Map()),
				storeAssetShas: vi.fn(),
			} as unknown as DataStore;
			const app = new App();
			const source = {
				path: asset.vaultPath,
				extension: "png",
				stat: { mtime: 1000 },
			} as TFile;
			vi.spyOn(app.vault, "getFileByPath").mockReturnValue(source);
			vi.spyOn(app.vault, "readBinary").mockResolvedValue(bytes.buffer);
			const settings = makeSettings({
				vaultPath: "/vault/",
				contentFolder: "site",
			});
			const compiler = new SyncerPageCompiler(
				app,
				app.vault,
				settings,
				app.metadataCache,
				dataStore,
			);
			const publisher = new Publisher(
				app,
				makePlugin(settings),
				backend,
				compiler,
				dataStore,
			);
			return {
				publisher,
				backend,
				gitBackend,
				dataStore,
				app,
				source,
				settings,
				compiler,
			};
		};

		it("round-trips padded base64 into bytes with the Git blob SHA, not the base64 text SHA", async () => {
			expect(content).toBe("AID/DQo=");
			const decoded = new Uint8Array(base64ToArrayBuffer(content));
			expect(decoded).toEqual(bytes);
			expect(await generateBlobHash(decoded)).toBe(sha);
			expect(await generateBlobHash(content)).not.toBe(sha);
		});

		it("skips identical media using the staged repo path and keeps note writes", async () => {
			const { publisher, backend, gitBackend } = await setup([
				remoteAsset,
			]);
			const cachedTree = vi.spyOn(backend, "getCachedTree");
			const result = await publisher.publishBatch([
				makePublishFile("notes/a.md"),
			]);
			expect(result.success).toBe(true);
			expect(cachedTree).toHaveBeenCalledExactlyOnceWith("main", true);
			expect(gitBackend.writeFiles).toHaveBeenCalledExactlyOnceWith(
				"main",
				"Publish notes",
				[
					{
						path: "site/notes/a.md",
						content: "hello",
						encoding: "utf-8",
					},
				],
			);
			// Only the existing post-write refresh reads the remote tree.
			expect(gitBackend.readTree).toHaveBeenCalledTimes(1);
			expect(
				vi.mocked(gitBackend.writeFiles).mock.invocationCallOrder[0],
			).toBeLessThan(
				vi.mocked(gitBackend.readTree).mock.invocationCallOrder[0]!,
			);
		});

		it("uses the full index even for paths outside the content index", async () => {
			const { publisher, gitBackend } = await setup([remoteAsset]);
			vi.spyOn(
				publisher.getPathMapper(),
				"isInContentFolder",
			).mockReturnValue(false);
			await publisher.publishBatch([makePublishFile("notes/a.md")]);
			expect(
				vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
			).toHaveLength(1);
		});

		it.each([
			["different bytes", [{ ...remoteAsset, sha: "different-sha" }]],
			["absent media", []],
			[
				"matching SHA at a different path",
				[{ ...remoteAsset, path: "site/other.png" }],
			],
		])("stages media for %s", async (_label, tree) => {
			const { publisher, gitBackend } = await setup(tree);
			await publisher.publishBatch([makePublishFile("notes/a.md")]);
			expect(vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2]).toEqual(
				[
					{
						path: "site/notes/a.md",
						content: "hello",
						encoding: "utf-8",
					},
					assetChange,
				],
			);
		});

		it.each(["cold", "null", "rejected"])(
			"stages every asset with a %s cache",
			async (state) => {
				const { publisher, backend, gitBackend, dataStore } =
					await setup();
				if (state === "null") {
					// Exercise a runtime null despite the non-null backend contract.
					vi.spyOn(backend, "getCachedTree").mockResolvedValue(
						null as unknown as TreeEntry[],
					);
				} else if (state === "rejected") {
					vi.spyOn(backend, "getCachedTree").mockRejectedValue(
						new Error("unavailable"),
					);
				}
				vi.mocked(dataStore.loadLocalFile).mockResolvedValue([
					"hello",
					{
						blobs: [
							asset,
							{ ...asset, path: "/vault/images/second.png" },
						],
					},
				]);
				const result = await publisher.publishBatch([
					makePublishFile("notes/a.md"),
				]);
				expect(result.success).toBe(true);
				expect(
					vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
				).toEqual([
					{
						path: "site/notes/a.md",
						content: "hello",
						encoding: "utf-8",
					},
					assetChange,
					{ ...assetChange, path: "site/images/second.png" },
				]);
				expect(gitBackend.readTree).toHaveBeenCalledTimes(1);
				expect(
					vi.mocked(gitBackend.writeFiles).mock
						.invocationCallOrder[0],
				).toBeLessThan(
					vi.mocked(gitBackend.readTree).mock.invocationCallOrder[0]!,
				);
			},
		);

		it("stages shared media once within and across notes", async () => {
			const { publisher, gitBackend, dataStore } = await setup();
			vi.mocked(dataStore.loadLocalFile).mockResolvedValue([
				"hello",
				{ blobs: [asset, { ...asset, path: "images/photo.png" }] },
			]);
			await publisher.publishBatch([
				makePublishFile("notes/a.md"),
				makePublishFile("notes/b.md"),
			]);
			expect(vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2]).toEqual(
				[
					{
						path: "site/notes/a.md",
						content: "hello",
						encoding: "utf-8",
					},
					assetChange,
					{
						path: "site/notes/b.md",
						content: "hello",
						encoding: "utf-8",
					},
				],
			);
		});

		it("does not deduplicate against assets discarded with a failed note", async () => {
			const { publisher, gitBackend, dataStore } = await setup();
			vi.mocked(dataStore.loadLocalHash).mockRejectedValueOnce(
				new Error("cache failure"),
			);
			const result = await publisher.publishBatch([
				makePublishFile("notes/a.md"),
				makePublishFile("notes/b.md"),
			]);
			expect(result.filesPublished).toBe(1);
			expect(vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2]).toEqual(
				[
					{
						path: "site/notes/b.md",
						content: "hello",
						encoding: "utf-8",
					},
					assetChange,
				],
			);
		});

		it("stages media when hashing fails", async () => {
			const { publisher, gitBackend } = await setup([remoteAsset]);
			const digest = vi
				.spyOn(crypto.subtle, "digest")
				.mockRejectedValueOnce(new Error("hash unavailable"));
			try {
				const result = await publisher.publishBatch([
					makePublishFile("notes/a.md"),
				]);
				expect(result.success).toBe(true);
				expect(
					vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
				).toContainEqual(assetChange);
			} finally {
				digest.mockRestore();
			}
		});

		it("re-hashes and stages when the SHA cache cannot be read (no base64 decode is needed)", async () => {
			const { publisher, gitBackend, dataStore } = await setup([
				{ ...remoteAsset, sha: "old-sha" },
			]);
			vi.mocked(dataStore.loadAssetShas).mockRejectedValue(
				new Error("cache unavailable"),
			);
			const result = await publisher.publishBatch([
				makePublishFile("notes/a.md"),
			]);
			expect(result.success).toBe(true);
			expect(
				vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
			).toContainEqual(assetChange);
		});

		it("reuses cached SHA without reading or hashing unchanged media across notes", async () => {
			const { publisher, app, gitBackend, dataStore } = await setup([
				remoteAsset,
			]);
			vi.mocked(dataStore.loadAssetShas).mockResolvedValue(
				new Map([[asset.vaultPath, { mtime: 1000, gitSha: sha }]]),
			);
			const digest = vi.spyOn(crypto.subtle, "digest");
			try {
				await publisher.publishBatch([
					makePublishFile("a.md"),
					makePublishFile("b.md"),
				]);
				expect(app.vault.readBinary).not.toHaveBeenCalled();
				expect(digest).not.toHaveBeenCalled();
				expect(dataStore.loadAssetShas).toHaveBeenCalledExactlyOnceWith(
					[asset.vaultPath],
				);
				expect(dataStore.storeAssetShas).not.toHaveBeenCalled();
				expect(
					vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
				).toHaveLength(2);
			} finally {
				digest.mockRestore();
			}
		});

		it.each([true, false])(
			"re-hashes changed mtime once; remote match = %s",
			async (matches) => {
				const { publisher, app, source, gitBackend, dataStore } =
					await setup([
						{ ...remoteAsset, sha: matches ? sha : "old-sha" },
					]);
				vi.mocked(dataStore.loadAssetShas).mockResolvedValue(
					new Map([
						[
							asset.vaultPath,
							{ mtime: 1000, gitSha: "0".repeat(40) },
						],
					]),
				);
				source.stat.mtime = 2000;
				await publisher.publishBatch([
					makePublishFile("a.md"),
					makePublishFile("b.md"),
				]);
				expect(app.vault.readBinary).toHaveBeenCalledExactlyOnceWith(
					source,
				);
				expect(
					dataStore.storeAssetShas,
				).toHaveBeenCalledExactlyOnceWith(
					new Map([[asset.vaultPath, { mtime: 2000, gitSha: sha }]]),
				);
				const changes = vi.mocked(gitBackend.writeFiles).mock
					.calls[0]?.[2];
				expect(changes).toHaveLength(matches ? 2 : 3);
				if (!matches) expect(changes).toContainEqual(assetChange);
			},
		);

		it("reads once to stage a cached SHA that differs from the remote", async () => {
			const { publisher, app, gitBackend, dataStore } = await setup([]);
			vi.mocked(dataStore.loadAssetShas).mockResolvedValue(
				new Map([[asset.vaultPath, { mtime: 1000, gitSha: sha }]]),
			);
			await publisher.publishBatch([makePublishFile("a.md")]);
			expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
			expect(
				vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
			).toContainEqual(assetChange);
		});

		it("SHA cache write failures do not prevent staging", async () => {
			const { publisher, gitBackend, dataStore } = await setup([]);
			vi.mocked(dataStore.storeAssetShas).mockRejectedValue(
				new Error("disk full"),
			);
			expect(
				(await publisher.publishBatch([makePublishFile("a.md")]))
					.success,
			).toBe(true);
			expect(
				vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
			).toContainEqual(assetChange);
		});

		it.each(["missing", "unreadable", "modified during read"])(
			"fails the note explicitly for a %s source instead of silently dropping media",
			async (state) => {
				const { publisher, app, source, gitBackend, dataStore } =
					await setup([remoteAsset]);
				if (state === "missing") {
					vi.mocked(app.vault.getFileByPath).mockReturnValue(null);
					vi.mocked(dataStore.loadAssetShas).mockResolvedValue(
						new Map([
							[asset.vaultPath, { mtime: 1000, gitSha: sha }],
						]),
					);
				} else if (state === "unreadable") {
					vi.mocked(app.vault.readBinary).mockRejectedValue(
						new Error("Asset unreadable"),
					);
				} else {
					vi.mocked(app.vault.readBinary).mockImplementation(
						async () => {
							source.stat.mtime += 1;
							return bytes.buffer;
						},
					);
				}
				const result = await publisher.publishBatch([
					makePublishFile("a.md"),
				]);
				expect(result.success).toBe(false);
				expect(result.failures).toEqual([
					{
						vaultPath: "a.md",
						error: expect.stringContaining("Asset"),
					},
				]);
				expect(gitBackend.writeFiles).not.toHaveBeenCalled();
				expect(dataStore.storeAssetShas).not.toHaveBeenCalled();
			},
		);

		it.each(["base", "canvas", "excalidraw", "markdown"] as const)(
			"compiles %s with zero binary reads and publishes byte-identical media",
			async (type) => {
				const {
					publisher,
					app,
					source,
					compiler,
					settings,
					gitBackend,
					dataStore,
				} = await setup([]);
				const path =
					type === "excalidraw"
						? "drawing.excalidraw.md"
						: `note.${type === "markdown" ? "md" : type}`;
				const raw =
					type === "canvas"
						? JSON.stringify({
								nodes: [{ type: "file", file: source.path }],
							})
						: type === "excalidraw"
							? `## Embedded Files\n[[${source.path}]]`
							: "![[photo.png#center|300]]";
				vi.spyOn(app.vault, "cachedRead").mockResolvedValue(raw);
				vi.spyOn(app.metadataCache, "getCache").mockReturnValue({
					embeds: [
						{
							link: "photo.png",
							original: "![[photo.png#center|300]]",
						},
					],
					links: [
						{ link: source.path, original: `[[${source.path}]]` },
					],
				} as ReturnType<typeof app.metadataCache.getCache>);
				// The second lookup fails for markdown: retain the known source,
				// while preserving the old blobLinkText destination and rewriting.
				vi.spyOn(
					app.metadataCache,
					"getFirstLinkpathDest",
				).mockImplementation((link) =>
					type === "markdown" && link === source.path ? null : source,
				);
				vi.spyOn(app.metadataCache, "fileToLinktext").mockReturnValue(
					"rewritten/photo.png",
				);
				const file = new PublishFile({
					file: {
						path,
						name: path,
						extension: path.split(".").pop(),
						stat: { mtime: 1000, ctime: 1000, size: raw.length },
					} as TFile,
					vault: app.vault,
					metadataCache: app.metadataCache,
					settings,
					compiler,
					datastore: dataStore,
				});
				const compiled = await compiler.generateMarkdown(file);
				expect(app.vault.readBinary).not.toHaveBeenCalled();
				const destination =
					type === "markdown" ? "rewritten/photo.png" : source.path;
				expect(compiled[1].blobs).toEqual([
					{ path: destination, vaultPath: source.path },
				]);
				expect(compiled[0]).toBe(
					type === "markdown"
						? "![[rewritten/photo.png#center|300]]\n"
						: raw,
				);
				vi.mocked(dataStore.loadLocalFile).mockResolvedValue(compiled);
				const result = await publisher.publishBatch([file]);
				expect(result.success).toBe(true);
				expect(app.vault.readBinary).toHaveBeenCalledExactlyOnceWith(
					source,
				);
				expect(
					vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2],
				).toEqual([
					{
						path: `site/${path}`,
						content: compiled[0],
						encoding: "utf-8",
					},
					{
						...assetChange,
						path:
							type === "markdown"
								? "site/rewritten/photo.png"
								: assetChange.path,
					},
				]);
			},
		);
	});

	describe("publishBatch failure isolation", () => {
		const makeFailingSetup = (failingPaths: string[]) => {
			const app = new App();
			const settings = makeSettings({ useCache: false });
			const plugin = makePlugin(settings);
			const gitBackend = makeGitBackend();
			const compiler = {
				extractBlobLinks: async () => [],
			} as unknown as SyncerPageCompiler;
			const dataStore = {
				loadLocalFile: vi.fn().mockResolvedValue(null),
				loadLocalHash: vi.fn().mockResolvedValue(null),
				storeRemoteHashes: vi.fn(),
			} as unknown as DataStore;

			const makeFile = (path: string): PublishFile =>
				({
					file: { path, stat: { mtime: 1000 } },
					getVaultPath: () => path,
					compile: failingPaths.includes(path)
						? vi
								.fn()
								.mockRejectedValue(new Error(`boom in ${path}`))
						: vi.fn().mockResolvedValue({
								getCompiledFile: () => [
									`content of ${path}`,
									{ blobs: [] },
								],
							}),
				}) as unknown as PublishFile;

			const backend = new RemotePublishBackend(gitBackend, "main");
			const publisher = new Publisher(
				app,
				plugin,
				backend,
				compiler,
				dataStore,
			);

			return { publisher, plugin, gitBackend, makeFile };
		};

		it("publishes healthy files and reports the failed one", async () => {
			const { publisher, gitBackend, makeFile } = makeFailingSetup([
				"notes/bad.md",
			]);

			const result = await publisher.publishBatch([
				makeFile("notes/a.md"),
				makeFile("notes/bad.md"),
				makeFile("notes/b.md"),
			]);

			expect(result.success).toBe(true);
			expect(result.filesPublished).toBe(2);
			expect(result.failures).toEqual([
				{
					vaultPath: "notes/bad.md",
					error: "boom in notes/bad.md",
				},
			]);

			const [, , changes] = vi.mocked(gitBackend.writeFiles).mock
				.calls[0] as unknown as [
				string,
				string,
				Array<{ path: string }>,
			];
			expect(changes.map((change) => change.path)).toEqual([
				"content/notes/a.md",
				"content/notes/b.md",
			]);
		});

		it("does not mark failed files as published", async () => {
			const { publisher, plugin, makeFile } = makeFailingSetup([
				"notes/bad.md",
			]);

			await publisher.publishBatch([
				makeFile("notes/a.md"),
				makeFile("notes/bad.md"),
			]);

			expect(plugin.statusCache.patchPublished).toHaveBeenCalledWith(
				new Set(["notes/a.md"]),
			);
		});

		it("fails the batch without writing when every file fails", async () => {
			const { publisher, plugin, gitBackend, makeFile } =
				makeFailingSetup(["notes/a.md", "notes/b.md"]);

			const result = await publisher.publishBatch([
				makeFile("notes/a.md"),
				makeFile("notes/b.md"),
			]);

			expect(result.success).toBe(false);
			expect(result.filesPublished).toBe(0);
			expect(result.failures).toHaveLength(2);
			expect(gitBackend.writeFiles).not.toHaveBeenCalled();
			expect(plugin.statusCache.patchPublished).not.toHaveBeenCalled();
		});

		it("omits failures when every file succeeds", async () => {
			const { publisher, makeFile } = makeFailingSetup([]);

			const result = await publisher.publishBatch([
				makeFile("notes/a.md"),
				makeFile("notes/b.md"),
			]);

			expect(result.success).toBe(true);
			expect(result.filesPublished).toBe(2);
			expect(result.failures).toBeUndefined();
		});

		it("reports progress for failed files so the bar still completes", async () => {
			const { publisher, makeFile } = makeFailingSetup(["notes/bad.md"]);
			const progress: number[] = [];

			await publisher.publishBatch(
				[makeFile("notes/a.md"), makeFile("notes/bad.md")],
				"msg",
				(current) => progress.push(current),
			);

			expect(progress).toEqual([1, 2]);
		});
	});

	it("deleteBatch calls deleteFiles with mapped paths", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.deleteBatch(["notes/a.md"]);

		expect(gitBackend.deleteFiles).toHaveBeenCalledWith(
			"main",
			"Delete notes",
			["content/notes/a.md"],
		);
		expect(dataStore.dropFile).toHaveBeenCalledWith("notes/a.md");
	});

	it("deleteBatch refreshes tree cache", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.deleteBatch(["notes/a.md"]);

		expect(gitBackend.readTree).toHaveBeenCalledWith("main");
	});

	it("deleteBatch patches status cache with deleted paths", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.deleteBatch(["notes/a.md", "notes/b.md"]);

		expect(plugin.statusCache.patchDeleted).toHaveBeenCalledWith(
			new Set(["notes/a.md", "notes/b.md"]),
		);
	});

	it("deleteByRepoPaths drops cache entries for deleted files", async () => {
		const app = new App();
		const settings = makeSettings({ contentFolder: "content" });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.deleteByRepoPaths([
			"content/images/photo.png",
			"content/notes/old.md",
		]);

		expect(dataStore.dropFile).toHaveBeenCalledWith("images/photo.png");
		expect(dataStore.dropFile).toHaveBeenCalledWith("notes/old.md");
	});

	it("pauses and resumes compilationQueue around getPublishStatus", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadStatusMetadata: vi.fn().mockResolvedValue(new Map()),
		} as unknown as DataStore;

		const mockQueue = {
			pause: vi.fn(),
			resume: vi.fn(),
		};

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => never[];
		};
		vaultStub.getFiles = vi.fn().mockReturnValue([]);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			mockQueue as never,
		);

		await publisher.getPublishStatus();

		expect(mockQueue.pause).toHaveBeenCalledTimes(1);
		expect(mockQueue.resume).toHaveBeenCalledTimes(1);

		const pauseOrder = mockQueue.pause.mock.invocationCallOrder[0]!;
		const resumeOrder = mockQueue.resume.mock.invocationCallOrder[0]!;
		const readOrder = vi.mocked(gitBackend.readTree).mock
			.invocationCallOrder[0]!;

		expect(pauseOrder).toBeLessThan(resumeOrder);
		expect(pauseOrder).toBeLessThan(readOrder);
		expect(readOrder).toBeLessThan(resumeOrder);
	});

	it("resumes compilationQueue even when getPublishStatus throws", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockRejectedValue(new Error("network error")),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadStatusMetadata: vi.fn().mockResolvedValue(new Map()),
		} as unknown as DataStore;

		const mockQueue = {
			pause: vi.fn(),
			resume: vi.fn(),
		};

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => never[];
		};
		vaultStub.getFiles = vi.fn().mockReturnValue([]);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			mockQueue as never,
		);

		await expect(publisher.getPublishStatus()).rejects.toThrow(
			"network error",
		);

		expect(mockQueue.resume).toHaveBeenCalledTimes(1);
		expect(mockQueue.pause).toHaveBeenCalledTimes(1);
		const readOrder = vi.mocked(gitBackend.readTree).mock
			.invocationCallOrder[0]!;
		expect(mockQueue.pause.mock.invocationCallOrder[0]).toBeLessThan(
			readOrder,
		);
		expect(readOrder).toBeLessThan(
			mockQueue.resume.mock.invocationCallOrder[0]!,
		);
	});

	it("cleanOrphanedMedia deletes only unlinked media files in content folder", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([
				{ path: "content/images/linked.png", type: "blob", sha: "1" },
				{ path: "content/images/orphan.png", type: "blob", sha: "2" },
			]),
		});
		const compiler = {
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["text", { blobs: [] }]),
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
			loadStatusMetadata: vi.fn().mockResolvedValue(
				new Map([
					[
						"notes/a.md",
						{
							localHash: null,
							mediaLinks: ["images/linked.png"],
							dynamicSources: [],
						},
					],
				]),
			),
		} as unknown as DataStore;

		const metadataStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
		};
		metadataStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
		};
		vaultStub.getFiles = vi.fn().mockReturnValue([
			{
				path: "notes/a.md",
				name: "a.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		]);
		app.vault.getMarkdownFiles = vi
			.fn()
			.mockReturnValue(vaultStub.getFiles());
		app.vault.getFileByPath = vi.fn(
			(path: string) =>
				(vaultStub
					.getFiles()
					.find((file) => file.path === path) as TFile) ?? null,
		);
		app.metadataCache.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		vi.mocked(resolveLinkedMedia).mockResolvedValue(
			new Set(["images/linked.png"]),
		);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const result = await publisher.cleanOrphanedMedia();

		expect(gitBackend.deleteFiles).toHaveBeenCalledWith(
			"main",
			"Cleaned orphaned media",
			["content/images/orphan.png"],
		);
		expect(dataStore.dropFile).toHaveBeenCalledWith("images/orphan.png");
		expect(result).toEqual({
			success: true,
			commitSha: "abc",
			filesPublished: 0,
			filesDeleted: 1,
		});
	});

	it("cleanOrphanedMedia returns null when no orphans exist", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([
				{
					path: "content/images/linked.png",
					type: "blob",
					sha: "1",
				},
			]),
		});
		const compiler = {
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["text", { blobs: [] }]),
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
			loadStatusMetadata: vi.fn().mockResolvedValue(
				new Map([
					[
						"notes/a.md",
						{
							localHash: null,
							mediaLinks: ["images/linked.png"],
							dynamicSources: [],
						},
					],
				]),
			),
		} as unknown as DataStore;

		const metadataStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
		};
		metadataStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
		};
		vaultStub.getFiles = vi.fn().mockReturnValue([
			{
				path: "notes/a.md",
				name: "a.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		]);
		app.vault.getMarkdownFiles = vi
			.fn()
			.mockReturnValue(vaultStub.getFiles());
		app.vault.getFileByPath = vi.fn(
			(path: string) =>
				(vaultStub
					.getFiles()
					.find((file) => file.path === path) as TFile) ?? null,
		);
		app.metadataCache.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		vi.mocked(resolveLinkedMedia).mockResolvedValue(
			new Set(["images/linked.png"]),
		);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const result = await publisher.cleanOrphanedMedia();

		expect(result).toBeNull();
		expect(gitBackend.deleteFiles).not.toHaveBeenCalled();
	});

	it("cleanOrphanedMedia skips non-media files and files outside content folder", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([
				{ path: "content/notes/a.md", type: "blob", sha: "1" },
				{ path: "assets/orphan.png", type: "blob", sha: "2" },
			]),
		});
		const compiler = {
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["text", { blobs: [] }]),
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			dropFile: vi.fn(),
			loadStatusMetadata: vi.fn().mockResolvedValue(
				new Map([
					[
						"notes/a.md",
						{
							localHash: null,
							mediaLinks: [],
							dynamicSources: [],
						},
					],
				]),
			),
		} as unknown as DataStore;

		const metadataStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
		};
		metadataStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
		};
		vaultStub.getFiles = vi.fn().mockReturnValue([
			{
				path: "notes/a.md",
				name: "a.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		]);
		app.vault.getMarkdownFiles = vi
			.fn()
			.mockReturnValue(vaultStub.getFiles());
		app.vault.getFileByPath = vi.fn(
			(path: string) =>
				(vaultStub
					.getFiles()
					.find((file) => file.path === path) as TFile) ?? null,
		);
		app.metadataCache.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		vi.mocked(resolveLinkedMedia).mockResolvedValue(new Set());

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const result = await publisher.cleanOrphanedMedia();

		expect(result).toBeNull();
		expect(gitBackend.deleteFiles).not.toHaveBeenCalled();
	});

	it("getRemoteFileContent returns content for existing remote file", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi
				.fn()
				.mockResolvedValue([
					{ path: "content/notes/a.md", type: "blob", sha: "sha-1" },
				]),
			readBlob: vi
				.fn()
				.mockResolvedValue(new TextEncoder().encode("hello remote")),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {} as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await expect(
			publisher.getRemoteFileContent("notes/a.md"),
		).resolves.toBe("hello remote");
		expect(gitBackend.readBlob).toHaveBeenCalledWith("sha-1");
	});

	it("getRemoteFileContent returns null for missing remote file", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([]),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {} as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await expect(
			publisher.getRemoteFileContent("notes/missing.md"),
		).resolves.toBeNull();
		expect(gitBackend.readBlob).not.toHaveBeenCalled();
	});

	it("getLocalCompiledContent returns compiled text from cache", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi
				.fn()
				.mockResolvedValue(["compiled", { blobs: [] }]),
		} as unknown as DataStore;

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);
		const file = makePublishFile("notes/a.md");

		await expect(publisher.getLocalCompiledContent(file)).resolves.toBe(
			"compiled",
		);
		expect(dataStore.loadLocalFile).toHaveBeenCalledWith(
			"notes/a.md",
			1000,
		);
	});

	it("getPublishStatus classifies published vs changed correctly with useCache true", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: true });
		const plugin = makePlugin(settings);

		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([
				{ path: "content/notes/a.md", type: "blob", sha: "hash-a" },
				{ path: "content/notes/b.md", type: "blob", sha: "hash-b" },
			]),
		});
		const compiler = {
			extractBlobLinks: async () => [],
		} as unknown as SyncerPageCompiler;

		const dataStore = {
			loadStatusMetadata: vi.fn().mockResolvedValue(
				new Map([
					["notes/a.md", { localHash: "hash-a", mediaLinks: [] }],
					[
						"notes/b.md",
						{ localHash: "hash-different", mediaLinks: [] },
					],
				]),
			),
			loadLocalHash: vi.fn(),
			loadCachedMediaLinks: vi.fn(),
		} as unknown as DataStore;

		const metaStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
			getFileCache?: (
				file: import("obsidian").TFile,
			) => { frontmatter: Record<string, unknown> } | null;
		};
		metaStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });
		metaStub.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getMarkdownFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getFileByPath?: (path: string) => import("obsidian").TFile | null;
		};
		const files = [
			{
				path: "notes/a.md",
				name: "a.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
			{
				path: "notes/b.md",
				name: "b.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		];
		vaultStub.getFiles = vi.fn().mockReturnValue(files);
		vaultStub.getMarkdownFiles = vi.fn().mockReturnValue(files);
		vaultStub.getFileByPath = vi
			.fn()
			.mockImplementation(
				(path: string) => files.find((f) => f.path === path) ?? null,
			);

		vi.mocked(resolveLinkedMedia).mockResolvedValue(new Set());

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const status = await publisher.getPublishStatus();

		const publishedPaths = status.published.map((f) => f.file.path);
		const changedPaths = status.changed.map((f) => f.file.path);

		expect(publishedPaths).toContain("notes/a.md");
		expect(changedPaths).toContain("notes/b.md");
		expect(status.unpublished).toHaveLength(0);
		expect(dataStore.loadStatusMetadata).toHaveBeenCalledExactlyOnceWith([
			{ path: "notes/a.md", mtime: 1000 },
			{ path: "notes/b.md", mtime: 1000 },
		]);
		expect(dataStore.loadLocalHash).not.toHaveBeenCalled();
		expect(dataStore.loadCachedMediaLinks).not.toHaveBeenCalled();
	});

	it("getPublishStatus puts files without remote counterpart into unpublished with useCache false", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: false });
		const plugin = makePlugin(settings);

		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([]),
		});
		const compiler = {
			extractBlobLinks: async () => [],
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["compiled", { blobs: [] }]),
		} as unknown as SyncerPageCompiler;

		const dataStore = {
			loadStatusMetadata: vi.fn(),
			loadLocalHash: vi.fn(),
			loadMediaLinks: vi.fn().mockResolvedValue([]),
		} as unknown as DataStore;

		const metaStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
			getFileCache?: (
				file: import("obsidian").TFile,
			) => { frontmatter: Record<string, unknown> } | null;
		};
		metaStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });
		metaStub.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getMarkdownFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getFileByPath?: (path: string) => import("obsidian").TFile | null;
		};
		const files = [
			{
				path: "notes/new.md",
				name: "new.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		];
		vaultStub.getFiles = vi.fn().mockReturnValue(files);
		vaultStub.getMarkdownFiles = vi.fn().mockReturnValue(files);
		vaultStub.getFileByPath = vi
			.fn()
			.mockImplementation(
				(path: string) => files.find((f) => f.path === path) ?? null,
			);

		vi.mocked(resolveLinkedMedia).mockResolvedValue(new Set());

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		const status = await publisher.getPublishStatus();

		const unpublishedPaths = status.unpublished.map((f) => f.file.path);
		expect(unpublishedPaths).toContain("notes/new.md");
		expect(dataStore.loadLocalHash).not.toHaveBeenCalled();
		expect(dataStore.loadStatusMetadata).not.toHaveBeenCalled();
	});

	it("getPublishStatus with useCache false does not read hashes from dataStore.loadLocalHash for remote-backed files", async () => {
		const app = new App();
		const settings = makeSettings({ useCache: false });
		const plugin = makePlugin(settings);

		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockResolvedValue([
				{
					path: "content/notes/a.md",
					type: "blob",
					sha: "remote-hash",
				},
			]),
		});

		const loadLocalHashSpy = vi.fn();
		const dataStore = {
			loadStatusMetadata: vi.fn(),
			loadLocalHash: loadLocalHashSpy,
			loadLocalFile: vi.fn().mockResolvedValue(null),
			storeLocalFile: vi.fn().mockResolvedValue(undefined),
			storeLocalHash: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
			loadMediaLinks: vi.fn().mockResolvedValue([]),
		} as unknown as DataStore;

		const compiler = {
			extractBlobLinks: async () => [],
			generateMarkdown: vi
				.fn()
				.mockResolvedValue(["compiled-text", { blobs: [] }]),
		} as unknown as SyncerPageCompiler;

		const metaStub = app.metadataCache as typeof app.metadataCache & {
			getCache?: (path: string) => {
				frontmatter: Record<string, unknown>;
			};
			getFileCache?: (
				file: import("obsidian").TFile,
			) => { frontmatter: Record<string, unknown> } | null;
		};
		metaStub.getCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });
		metaStub.getFileCache = vi
			.fn()
			.mockReturnValue({ frontmatter: { publish: true } });

		const vaultStub = app.vault as typeof app.vault & {
			getFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getMarkdownFiles?: () => Array<{
				path: string;
				name: string;
				extension: string;
				stat: { mtime: number };
			}>;
			getFileByPath?: (path: string) => import("obsidian").TFile | null;
		};
		const files = [
			{
				path: "notes/a.md",
				name: "a.md",
				extension: "md",
				stat: { mtime: 1000 },
			},
		];
		vaultStub.getFiles = vi.fn().mockReturnValue(files);
		vaultStub.getMarkdownFiles = vi.fn().mockReturnValue(files);
		vaultStub.getFileByPath = vi
			.fn()
			.mockImplementation(
				(path: string) => files.find((f) => f.path === path) ?? null,
			);

		vi.mocked(resolveLinkedMedia).mockResolvedValue(new Set());

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
		);

		await publisher.getPublishStatus();

		expect(loadLocalHashSpy).not.toHaveBeenCalled();
	});

	describe("getPublishStatus media links", () => {
		const setup = (
			cachedLinks: Array<string[] | null>,
			useCache = true,
		) => {
			const app = new App();
			const settings = makeSettings({ useCache });
			const plugin = makePlugin(settings);
			const files = cachedLinks.map(
				(_, index) =>
					({
						path: `notes/${index}.md`,
						name: `${index}.md`,
						extension: "md",
						stat: { mtime: 1000 },
					}) as TFile,
			);
			app.vault.getFiles = vi.fn().mockReturnValue(files);
			app.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);
			app.vault.getFileByPath = vi.fn(
				(path: string) =>
					files.find((file) => file.path === path) ?? null,
			);
			app.metadataCache.getCache = vi.fn().mockReturnValue({
				frontmatter: { publish: true },
			});
			app.metadataCache.getFileCache = vi.fn().mockReturnValue({
				frontmatter: { publish: true },
			});
			const dataStore = new DataStore(
				"vault",
				"plugin",
				"1.0.0",
				"",
				() => settings,
				() => ({ dataviewRevision: 2, datacoreRevision: 8 }),
			);
			vi.spyOn(dataStore.persister, "getMany").mockImplementation(
				async (keys) =>
					keys.map((key) => {
						const index = files.findIndex(
							(file) => `file:${file.path}` === key,
						);
						return {
							version: "1.0.0",
							time: 1000,
							sourceMtime: 1000,
							settingsFingerprint: settingsFingerprint(settings),
							detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
							dynamicSources: [],
							localHash:
								index % 3 === 0
									? `sha-${index}`
									: index % 3 === 1
										? "changed"
										: undefined,
							mediaLinks: cachedLinks[index] ?? undefined,
						} satisfies QuartzSyncerCache;
					}),
			);
			const loadStatusMetadata = vi.spyOn(
				dataStore,
				"loadStatusMetadata",
			);
			const loadCachedMediaLinks = vi.spyOn(
				dataStore,
				"loadCachedMediaLinks",
			);
			const loadLocalHash = vi.spyOn(dataStore, "loadLocalHash");
			const extractBlobLinks = vi.fn(async (file: PublishFile) => [
				`images/fresh-${file.file.name}.png`,
			]);
			const compiler = {
				extractBlobLinks,
			} as unknown as SyncerPageCompiler;
			const gitBackend = makeGitBackend({
				readTree: vi.fn().mockResolvedValue([
					{
						path: "content/images/cached.png",
						type: "blob",
						sha: "1",
					},
					{
						path: "content/images/fresh-0.md.png",
						type: "blob",
						sha: "2",
					},
					{
						path: "content/images/fresh-1.md.png",
						type: "blob",
						sha: "3",
					},
					{
						path: "content/images/orphan.png",
						type: "blob",
						sha: "4",
					},
				]),
			});
			const publisher = new Publisher(
				app,
				plugin,
				new RemotePublishBackend(gitBackend, "main"),
				compiler,
				dataStore,
			);

			return {
				publisher,
				loadStatusMetadata,
				loadCachedMediaLinks,
				loadLocalHash,
				extractBlobLinks,
				dataStore,
				gitBackend,
				files,
			};
		};

		it("uses cached links including empty arrays without fresh extraction", async () => {
			const {
				publisher,
				loadStatusMetadata,
				loadCachedMediaLinks,
				extractBlobLinks,
			} = setup([["images/cached.png"], []]);

			const status = await publisher.getPublishStatus();

			expect(status.mediaLinks).toEqual(
				new Map([["notes/0.md", ["images/cached.png"]]]),
			);
			expect(loadStatusMetadata).toHaveBeenCalledExactlyOnceWith([
				{ path: "notes/0.md", mtime: 1000 },
				{ path: "notes/1.md", mtime: 1000 },
			]);
			expect(loadCachedMediaLinks).not.toHaveBeenCalled();
			expect(extractBlobLinks).not.toHaveBeenCalled();
			expect(resolveLinkedMediaByFile).not.toHaveBeenCalled();
		});

		it("merges cache hits and fresh extraction for missing or stale entries", async () => {
			const { publisher, extractBlobLinks } = setup([
				["images/cached.png"],
				null,
				[],
			]);

			const status = await publisher.getPublishStatus();

			expect(status.mediaLinks).toEqual(
				new Map([
					["notes/0.md", ["images/cached.png"]],
					["notes/1.md", ["images/fresh-1.md.png"]],
				]),
			);
			expect(extractBlobLinks).toHaveBeenCalledOnce();
			expect(extractBlobLinks.mock.calls[0]?.[0].file.path).toBe(
				"notes/1.md",
			);
		});

		it("classifies a dynamic note as changed when its dependency revision moved", async () => {
			const { publisher, dataStore, gitBackend } = setup([[]]);
			vi.mocked(gitBackend.readTree).mockResolvedValue([
				{
					path: "content/notes/0.md",
					type: "blob",
					sha: "stale-dynamic-hash",
				},
			]);
			vi.mocked(dataStore.persister.getMany).mockResolvedValue([
				{
					version: "1.0.0",
					time: 1000,
					sourceMtime: 1000,
					settingsFingerprint: settingsFingerprint(
						makeSettings({ useCache: true }),
					),
					detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
					dynamicSources: ["dataview"],
					dataviewRevision: 1,
					localHash: "stale-dynamic-hash",
					localData: ["stale", { blobs: [] }],
					mediaLinks: [],
				},
			]);

			const status = await publisher.getPublishStatus();

			expect(status.published).toHaveLength(0);
			expect(status.changed.map(({ file }) => file.path)).toEqual([
				"notes/0.md",
			]);
		});

		it("protects query-rendered media while still deleting a genuine orphan", async () => {
			const app = new App();
			const settings = makeSettings({
				useCache: true,
				useDataview: true,
			});
			const plugin = makePlugin(settings);
			const note = {
				path: "notes/dynamic.md",
				name: "dynamic.md",
				extension: "md",
				stat: { mtime: 1000, ctime: 1000, size: 40 },
			} as TFile;
			const sourceImage = {
				path: "images/source.png",
				name: "source.png",
				extension: "png",
				stat: { mtime: 1000, ctime: 1000, size: 10 },
			} as TFile;
			const queryImage = {
				path: "images/query-output.png",
				name: "query-output.png",
				extension: "png",
				stat: { mtime: 1000, ctime: 1000, size: 10 },
			} as TFile;

			app.vault.getFiles = vi
				.fn()
				.mockReturnValue([note, sourceImage, queryImage]);
			app.vault.getMarkdownFiles = vi.fn().mockReturnValue([note]);
			app.vault.getFileByPath = vi.fn((path: string) =>
				path === note.path
					? note
					: path === sourceImage.path
						? sourceImage
						: path === queryImage.path
							? queryImage
							: null,
			);
			// The query renders an embed that the note's source never mentions.
			app.vault.cachedRead = vi
				.fn()
				.mockResolvedValue(
					"```dataview\nLIST\n```\n\n![[images/query-output.png]]\n",
				);
			app.metadataCache.getCache = vi.fn().mockReturnValue({
				frontmatter: { publish: true },
				embeds: [
					{
						link: "images/source.png",
						original: "![[images/source.png]]",
					},
				],
			});
			app.metadataCache.getFileCache = vi.fn().mockReturnValue({
				frontmatter: { publish: true },
			});
			app.metadataCache.getFirstLinkpathDest = vi
				.fn()
				.mockImplementation((path: string) =>
					path === "images/source.png"
						? sourceImage
						: path === "images/query-output.png"
							? queryImage
							: null,
				);
			app.metadataCache.fileToLinktext = vi
				.fn()
				.mockImplementation((file: TFile) => file.path);

			const dataStore = new DataStore(
				"cleanup-restored-vault",
				"plugin",
				"1.0.0",
				"",
				() => settings,
				() => ({ dataviewRevision: 2, datacoreRevision: 8 }),
			);
			const cleanupCache = new Map<string, unknown>();
			dataStore.persister = {
				getItem: async <T>(key: string) =>
					(cleanupCache.get(key) as T | undefined) ?? null,
				getMany: async <T>(keys: string[]) =>
					keys.map(
						(key) =>
							(cleanupCache.get(key) as T | undefined) ?? null,
					),
				setItem: async <T>(key: string, value: T) => {
					cleanupCache.set(key, value);
				},
				setMany: async <T>(
					entries: Array<{ key: string; value: T }>,
				) => {
					for (const { key, value } of entries)
						cleanupCache.set(key, value);
				},
				removeItem: async (key: string) => {
					cleanupCache.delete(key);
				},
				keys: async () => [...cleanupCache.keys()],
				iterate: async <T>(
					callback: (value: T, key: string) => void,
				) => {
					for (const [key, value] of cleanupCache)
						callback(value as T, key);
				},
				close: () => undefined,
			} satisfies IndexedDBStore;

			const compiler = new SyncerPageCompiler(
				app,
				app.vault,
				settings,
				app.metadataCache,
				dataStore,
			);
			const gitBackend = makeGitBackend({
				readTree: vi.fn().mockResolvedValue([
					{
						path: "content/images/source.png",
						type: "blob",
						sha: "source",
					},
					{
						path: "content/images/query-output.png",
						type: "blob",
						sha: "live",
					},
					{
						path: "content/images/orphan.png",
						type: "blob",
						sha: "orphan",
					},
				]),
			});
			const publisher = new Publisher(
				app,
				plugin,
				new RemotePublishBackend(gitBackend, "main"),
				compiler,
				dataStore,
			);

			// A live, never-aborted signal must not change the outcome.
			const result = await publisher.cleanOrphanedMedia(
				new AbortController().signal,
			);

			const deleted = vi.mocked(gitBackend.deleteFiles).mock
				.calls[0]?.[2] as string[] | undefined;

			expect(result?.success).toBe(true);
			expect(deleted).toEqual(["content/images/orphan.png"]);
		});

		it("omits cache misses whose fresh extraction finds no links", async () => {
			const { publisher, extractBlobLinks } = setup([null]);
			extractBlobLinks.mockResolvedValue([]);

			const status = await publisher.getPublishStatus();

			expect(status.mediaLinks).toEqual(new Map());
			expect(extractBlobLinks).toHaveBeenCalledOnce();
		});

		it("preserves classifications and links across metadata chunk boundaries", async () => {
			const cachedLinks = Array.from({ length: 1001 }, (_, index) =>
				index % 3 === 0
					? [`images/${index}.png`]
					: index % 3 === 1
						? []
						: null,
			);
			const {
				publisher,
				files,
				gitBackend,
				dataStore,
				loadLocalHash,
				loadCachedMediaLinks,
			} = setup(cachedLinks);
			vi.mocked(gitBackend.readTree).mockResolvedValue(
				files.slice(0, 1000).map((file, index) => ({
					path: `content/${file.path}`,
					sha: `sha-${index}`,
					type: "blob",
				})),
			);

			const status = await publisher.getPublishStatus();

			expect(status.published.map(({ file }) => file.path)).toEqual(
				files
					.slice(0, 1000)
					.filter((_, index) => index % 3 === 0)
					.map((file) => file.path),
			);
			expect(status.changed.map(({ file }) => file.path)).toEqual(
				files
					.slice(0, 1000)
					.filter((_, index) => index % 3 !== 0)
					.map((file) => file.path),
			);
			expect(status.unpublished.map(({ file }) => file.path)).toEqual([
				"notes/1000.md",
			]);
			const expectedLinks = new Map<string, string[]>();
			files.forEach((file, index) => {
				const links = cachedLinks[index] ?? [
					`images/fresh-${file.name}.png`,
				];
				if (links.length) expectedLinks.set(file.path, links);
			});
			expect(status.mediaLinks).toEqual(expectedLinks);
			expect(dataStore.persister.getMany).toHaveBeenCalledTimes(3);
			expect(loadLocalHash).not.toHaveBeenCalled();
			expect(loadCachedMediaLinks).not.toHaveBeenCalled();
		});

		it.each([false, true])(
			"bounds fresh extraction concurrency (mobile=%s)",
			async (isMobile) => {
				const wasMobile = Platform.isMobileApp;
				Platform.isMobileApp = isMobile;
				const { publisher, extractBlobLinks } = setup(
					Array.from({ length: 13 }, () => null),
				);
				let active = 0;
				let maximum = 0;
				extractBlobLinks.mockImplementation(async () => {
					active++;
					maximum = Math.max(maximum, active);
					await new Promise((resolve) => setTimeout(resolve, 0));
					active--;
					return [];
				});
				try {
					const status = await publisher.getPublishStatus();
					expect(maximum).toBe(isMobile ? 2 : 5);
					expect(extractBlobLinks).toHaveBeenCalledTimes(13);
					expect(status.mediaLinks).toEqual(new Map());
				} finally {
					Platform.isMobileApp = wasMobile;
				}
			},
		);

		it.each([true, false])(
			"derives orphan flags from returned links with useCache=%s",
			async (useCache) => {
				const { publisher, loadCachedMediaLinks, extractBlobLinks } =
					setup([["images/cached.png"], null], useCache);

				const status = await publisher.getPublishStatus();
				const linked = flattenLinkedMedia(status.mediaLinks!);

				expect(linked).toEqual(
					new Set(
						useCache
							? ["images/cached.png", "images/fresh-1.md.png"]
							: [
									"images/fresh-0.md.png",
									"images/fresh-1.md.png",
								],
					),
				);

				for (const media of status.media) {
					expect(media.linked).toBe(linked.has(media.vaultPath));
				}

				expect(extractBlobLinks).toHaveBeenCalledTimes(
					useCache ? 1 : 2,
				);

				if (!useCache) {
					expect(loadCachedMediaLinks).not.toHaveBeenCalled();
					expect(resolveLinkedMediaByFile).toHaveBeenCalledOnce();
				}
			},
		);
	});

	describe("cleanOrphanedMedia concurrency and abort", () => {
		const setupCleanup = (
			noteCount: number,
			extraRemoteMedia: string[],
		) => {
			const app = new App();
			const settings = makeSettings({
				useCache: true,
				useDataview: true,
				autoCleanOrphanedMedia: true,
			});
			const plugin = makePlugin(settings);

			const notes = Array.from(
				{ length: noteCount },
				(_, index) =>
					({
						path: `notes/${index}.md`,
						name: `${index}.md`,
						extension: "md",
						stat: { mtime: 1000, ctime: 1000, size: 10 },
					}) as TFile,
			);
			const images = Array.from(
				{ length: noteCount },
				(_, index) =>
					({
						path: `images/${index}.png`,
						name: `${index}.png`,
						extension: "png",
						stat: { mtime: 1000, ctime: 1000, size: 10 },
					}) as TFile,
			);

			app.vault.getFiles = vi.fn().mockReturnValue([...notes, ...images]);
			app.vault.getMarkdownFiles = vi.fn().mockReturnValue(notes);
			app.vault.getFileByPath = vi.fn(
				(path: string) =>
					[...notes, ...images].find((file) => file.path === path) ??
					null,
			);
			app.vault.cachedRead = vi.fn().mockResolvedValue("body\n");
			app.metadataCache.getCache = vi
				.fn()
				.mockReturnValue({ frontmatter: { publish: true } });
			app.metadataCache.getFileCache = vi
				.fn()
				.mockReturnValue({ frontmatter: { publish: true } });

			const store = new Map<string, unknown>();
			const dataStore = new DataStore(
				"cleanup-abort-vault",
				"plugin",
				"1.0.0",
				"",
				() => settings,
				() => ({ dataviewRevision: 2, datacoreRevision: 8 }),
			);
			dataStore.persister = {
				getItem: async <T>(key: string) =>
					(store.get(key) as T | undefined) ?? null,
				getMany: async <T>(keys: string[]) =>
					keys.map(
						(key) => (store.get(key) as T | undefined) ?? null,
					),
				setItem: async <T>(key: string, value: T) => {
					store.set(key, value);
				},
				setMany: async <T>(
					entries: Array<{ key: string; value: T }>,
				) => {
					for (const { key, value } of entries) store.set(key, value);
				},
				removeItem: async (key: string) => {
					store.delete(key);
				},
				keys: async () => [...store.keys()],
				iterate: async <T>(
					callback: (value: T, key: string) => void,
				) => {
					for (const [key, value] of store) callback(value as T, key);
				},
				close: () => undefined,
			} satisfies IndexedDBStore;

			// No cached media links, so every note falls through to a compile.
			vi.spyOn(dataStore, "loadStatusMetadata").mockResolvedValue(
				new Map(),
			);

			const compileFor = (file: PublishFile) => {
				const index = notes.findIndex(
					(note) => note.path === file.file.path,
				);

				return {
					compiledFile: [
						"out",
						{
							blobs: [
								{
									vaultPath: `images/${index}.png`,
									repoPath: `content/images/${index}.png`,
									content: "",
								},
							],
						},
					] as unknown as ReturnType<PublishFile["getCompiledFile"]>,
					successfulVaultDependentExecutions: new Set<string>(),
				};
			};

			const generateMarkdownWithEvidence = vi.fn(
				async (file: PublishFile) => compileFor(file),
			);
			const compiler = {
				generateMarkdownWithEvidence,
				extractBlobLinks: vi.fn().mockResolvedValue([]),
			} as unknown as SyncerPageCompiler;

			const gitBackend = makeGitBackend({
				readTree: vi.fn().mockResolvedValue([
					...images.map((image) => ({
						path: `content/${image.path}`,
						type: "blob",
						sha: image.name,
					})),
					...extraRemoteMedia.map((path) => ({
						path: `content/${path}`,
						type: "blob",
						sha: path,
					})),
				] as TreeEntry[]),
			});

			const publisher = new Publisher(
				app,
				plugin,
				new RemotePublishBackend(gitBackend, "main"),
				compiler,
				dataStore,
			);

			return { publisher, generateMarkdownWithEvidence, gitBackend };
		};

		it.each([false, true])(
			"bounds cleanup compile concurrency (mobile=%s)",
			async (isMobile) => {
				const wasMobile = Platform.isMobileApp;
				Platform.isMobileApp = isMobile;

				try {
					const { publisher, generateMarkdownWithEvidence } =
						setupCleanup(13, []);
					let active = 0;
					let maximum = 0;

					generateMarkdownWithEvidence.mockImplementation(
						async (file: PublishFile) => {
							active++;
							maximum = Math.max(maximum, active);
							await new Promise((resolve) =>
								setTimeout(resolve, 0),
							);
							active--;

							return {
								compiledFile: ["out", { blobs: [] }],
								successfulVaultDependentExecutions: new Set(),
							} as unknown as Awaited<
								ReturnType<typeof generateMarkdownWithEvidence>
							>;
						},
					);

					await publisher.cleanOrphanedMedia();

					expect(maximum).toBe(isMobile ? 2 : 5);
					expect(generateMarkdownWithEvidence).toHaveBeenCalledTimes(
						13,
					);
				} finally {
					Platform.isMobileApp = wasMobile;
				}
			},
		);

		it("stops issuing compiles once the caller aborts", async () => {
			const wasMobile = Platform.isMobileApp;
			Platform.isMobileApp = false;

			try {
				const { publisher, generateMarkdownWithEvidence } =
					setupCleanup(13, []);
				const controller = new AbortController();

				generateMarkdownWithEvidence.mockImplementation(async () => {
					controller.abort();

					return {
						compiledFile: ["out", { blobs: [] }],
						successfulVaultDependentExecutions: new Set(),
					} as unknown as Awaited<
						ReturnType<typeof generateMarkdownWithEvidence>
					>;
				});

				await publisher.cleanOrphanedMedia(controller.signal);

				// One chunk of 5 is already in flight when the abort lands;
				// every later chunk must short-circuit.
				expect(
					generateMarkdownWithEvidence.mock.calls.length,
				).toBeLessThanOrEqual(5);
				expect(
					generateMarkdownWithEvidence.mock.calls.length,
				).toBeLessThan(13);
			} finally {
				Platform.isMobileApp = wasMobile;
			}
		});

		it("deletes nothing when aborted mid-resolution", async () => {
			const { publisher, generateMarkdownWithEvidence, gitBackend } =
				setupCleanup(4, ["images/orphan.png"]);
			const controller = new AbortController();
			const original =
				generateMarkdownWithEvidence.getMockImplementation();

			generateMarkdownWithEvidence.mockImplementation(
				async (file: PublishFile) => {
					controller.abort();

					return original!(file);
				},
			);

			const result = await publisher.cleanOrphanedMedia(
				controller.signal,
			);

			expect(result).toBeNull();
			expect(gitBackend.deleteFiles).not.toHaveBeenCalled();
		});

		it("lets an in-flight compile finish, then discards its result", async () => {
			const { publisher, generateMarkdownWithEvidence, gitBackend } =
				setupCleanup(4, ["images/orphan.png"]);
			const controller = new AbortController();
			let started = 0;
			let finished = 0;

			generateMarkdownWithEvidence.mockImplementation(async () => {
				started++;
				controller.abort();
				await new Promise((resolve) => setTimeout(resolve, 0));
				finished++;

				return {
					compiledFile: ["out", { blobs: [] }],
					successfulVaultDependentExecutions: new Set(),
				} as unknown as Awaited<
					ReturnType<typeof generateMarkdownWithEvidence>
				>;
			});

			const result = await publisher.cleanOrphanedMedia(
				controller.signal,
			);

			// The contract is "stop issuing compiles", not "cancel running
			// ones": work already in flight runs to completion, and it is the
			// post-compile signal check that throws the result away.
			expect(started).toBeGreaterThan(0);
			expect(finished).toBe(started);
			expect(result).toBeNull();
			expect(gitBackend.deleteFiles).not.toHaveBeenCalled();
		});

		it("still deletes the orphan when the signal never aborts", async () => {
			const { publisher, gitBackend } = setupCleanup(4, [
				"images/orphan.png",
			]);
			const controller = new AbortController();

			const result = await publisher.cleanOrphanedMedia(
				controller.signal,
			);

			const deleted = vi.mocked(gitBackend.deleteFiles).mock
				.calls[0]?.[2] as string[] | undefined;

			expect(result?.success).toBe(true);
			expect(deleted).toEqual(["content/images/orphan.png"]);
		});
	});

	describe("integration stylesheets", () => {
		beforeEach(() => {
			collectAssetsMock.mockReset();

			collectAssetsMock.mockImplementation(
				async (): Promise<AssetSyncResult> => ({
					success: true,
					filesToStage: new Map([
						["quartz/styles/syncer/_index.scss", "@use './x';"],
					]),
					filesToDelete: [],
				}),
			);
		});

		const setup = async (
			supportsV5Management: boolean,
			manageSyncerStyles = true,
		) => {
			const app = new App();
			const settings = makeSettings({ manageSyncerStyles });
			const plugin = makePlugin(settings, supportsV5Management);
			const gitBackend = makeGitBackend();
			const backend = new RemotePublishBackend(gitBackend, "main");

			const compiler = {
				extractBlobLinks: async () => [],
			} as unknown as SyncerPageCompiler;

			const dataStore = {
				loadLocalFile: vi
					.fn()
					.mockResolvedValue(["hello", { blobs: [] }]),
				loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
				storeRemoteHashes: vi.fn(),
			} as unknown as DataStore;

			const publisher = new Publisher(
				app,
				plugin,
				backend,
				compiler,
				dataStore,
			);

			await publisher.publishBatch([makePublishFile("note.md")]);

			const written = vi.mocked(gitBackend.writeFiles).mock.calls[0]?.[2];

			return (written ?? []).map((change) => change.path);
		};

		it("publishes integration styles on a Quartz v5 repository", async () => {
			const paths = await setup(true);

			expect(
				paths.some((path) => path.startsWith("quartz/styles/syncer/")),
			).toBe(true);
		});

		it("writes nothing outside the content folder on a non-v5 repository", async () => {
			const paths = await setup(false);

			expect(paths.every((path) => path.startsWith("content/"))).toBe(
				true,
			);
		});

		it("stages no syncer styles when the setting is disabled", async () => {
			collectAssetsMock.mockResolvedValue({
				success: true,
				filesToStage: new Map(),
				filesToDelete: [],
			});
			const paths = await setup(true, false);

			expect(
				paths.some((path) => path.startsWith("quartz/styles/syncer/")),
			).toBe(false);
		});
	});
});
