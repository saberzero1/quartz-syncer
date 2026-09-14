import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Platform, type TFile } from "obsidian";
import { Publisher } from "src/publisher/Publisher";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import type { GitBackend } from "src/git/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type QuartzSyncer from "src/main";
import type { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore, type QuartzSyncerCache } from "src/cache/DataStore";
import type { AssetSyncResult } from "src/compiler/integrations/AssetSyncer";
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
			{ path: "notes/a.md", timestamp: 1234, hash: "sha-1" },
			{ path: "notes/b.md", timestamp: 1234, hash: "sha-1" },
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
		const settings = makeSettings({ useCache: false });
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
		const settings = makeSettings({ useCache: false });
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
		const settings = makeSettings({ useCache: false });
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
			true,
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
			const dataStore = new DataStore("vault", "plugin", "1.0.0");
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
