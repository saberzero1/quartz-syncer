import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, getIcon } from "obsidian";
import { Publisher } from "src/publisher/Publisher";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import type { GitBackend } from "src/git/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type QuartzSyncer from "src/main";
import type { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import type { DataStore } from "src/cache/DataStore";
import { resolveLinkedMedia } from "src/publisher/MediaLinkResolver";
import { integrationRegistry } from "src/compiler/integrations/registry";

vi.mock("src/publisher/MediaLinkResolver", () => ({
	resolveLinkedMedia: vi.fn(),
}));

vi.mock("src/compiler/integrations/registry", () => ({
	integrationRegistry: {
		getCollectedAssets: vi.fn().mockReturnValue(new Map()),
	},
}));

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	settingsSchemaVersion: 2,
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
	useCssSnippets: false,
	copyCssSnippets: [],
	noteSettingsIsInitialized: false,
	lastUsedSettingsTab: "",
	pluginVersion: "0.0.0",
	lastUpstreamCommitSha: "",
	upgradeCheckStrategy: "version",
	diffViewStyle: "auto",
	allowArbitraryFilePublishing: false,
	arbitraryPublishPaths: [],
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: false,
	...overrides,
});

const makePlugin = (settings: QuartzSyncerSettings): QuartzSyncer =>
	({
		settings,
		saveSettings: vi.fn(),
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
		vi.mocked(getIcon).mockClear();
	});

	it("publishBatch calls writeFiles with compiled content", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
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

	it("publishBatch stages integration asset files via the quartz file source", async () => {
		const app = new App();
		const settings = makeSettings({ manageSyncerStyles: true });
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
		} as unknown as DataStore;
		const quartzFileSource = {
			readFile: vi.fn().mockResolvedValue(null),
			writeFile: vi.fn(),
			writeBinaryFile: vi.fn(),
			deleteFile: vi.fn(),
			listDirectory: vi.fn().mockResolvedValue([]),
			listAllFiles: vi.fn().mockResolvedValue([]),
			exists: vi.fn().mockResolvedValue(false),
		};

		vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
			new Map([["dataview", { scss: ".dataview { color: red; }" }]]),
		);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			undefined,
			undefined,
			quartzFileSource,
		);

		const file = makePublishFile("notes/a.md");
		await publisher.publishBatch([file]);

		const [, , stagedFiles] = gitBackend.writeFiles.mock.calls[0];
		const paths = stagedFiles.map((f: { path: string }) => f.path);

		expect(paths).toContain("quartz/styles/syncer/_dataview.scss");
		expect(paths).toContain("quartz/styles/syncer/_index.scss");
	});

	it("publishBatch stages selected CSS snippets read from the vault adapter", async () => {
		const app = new App();
		const settings = makeSettings({
			manageSyncerStyles: true,
			useCssSnippets: true,
			copyCssSnippets: ["star_wars_destiny.css"],
		});
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
		} as unknown as DataStore;
		const quartzFileSource = {
			readFile: vi.fn().mockResolvedValue(null),
			writeFile: vi.fn(),
			writeBinaryFile: vi.fn(),
			deleteFile: vi.fn(),
			listDirectory: vi.fn().mockResolvedValue([]),
			listAllFiles: vi.fn().mockResolvedValue([]),
			exists: vi.fn().mockResolvedValue(false),
		};

		vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
			new Map(),
		);
		app.vault.adapter.list = vi.fn().mockResolvedValue({
			files: [
				".obsidian/snippets/star_wars_destiny.css",
				".obsidian/snippets/other.css",
			],
			folders: [],
		});
		app.vault.adapter.read = vi
			.fn()
			.mockResolvedValue(".destiny { color: gold; }");

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			undefined,
			undefined,
			quartzFileSource,
		);

		const file = makePublishFile("notes/a.md");
		await publisher.publishBatch([file]);

		expect(app.vault.adapter.list).toHaveBeenCalledWith(
			".obsidian/snippets",
		);
		expect(app.vault.adapter.read).toHaveBeenCalledWith(
			".obsidian/snippets/star_wars_destiny.css",
		);

		const [, , stagedFiles] = gitBackend.writeFiles.mock.calls[0];
		const paths = stagedFiles.map((f: { path: string }) => f.path);

		expect(paths).toContain(
			"quartz/styles/syncer/_star_wars_destiny.scss",
		);
	});

	it("publishBatch rewrites bare Lucide callout icon names into data URIs", async () => {
		const app = new App();
		const settings = makeSettings({
			manageSyncerStyles: true,
			useCssSnippets: true,
			copyCssSnippets: ["storage.css"],
		});
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
		} as unknown as DataStore;
		const quartzFileSource = {
			readFile: vi.fn().mockResolvedValue(null),
			writeFile: vi.fn(),
			writeBinaryFile: vi.fn(),
			deleteFile: vi.fn(),
			listDirectory: vi.fn().mockResolvedValue([]),
			listAllFiles: vi.fn().mockResolvedValue([]),
			exists: vi.fn().mockResolvedValue(false),
		};

		vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
			new Map(),
		);
		vi.mocked(getIcon).mockReturnValue({
			outerHTML: '<svg><path d="M1 1"/></svg>',
		} as unknown as SVGSVGElement);
		app.vault.adapter.list = vi.fn().mockResolvedValue({
			files: [".obsidian/snippets/storage.css"],
			folders: [],
		});
		app.vault.adapter.read = vi.fn().mockResolvedValue(
			'.callout[data-callout="storage-callout"] {\n' +
				"\t--callout-color: 132, 0, 192;\n" +
				"\t--callout-icon: lucide-package-open;\n" +
				"}",
		);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			undefined,
			undefined,
			quartzFileSource,
		);

		const file = makePublishFile("notes/a.md");
		await publisher.publishBatch([file]);

		expect(getIcon).toHaveBeenCalledWith("lucide-package-open");

		const [, , stagedFiles] = gitBackend.writeFiles.mock.calls[0];
		const scssFile = stagedFiles.find(
			(f: { path: string }) =>
				f.path === "quartz/styles/syncer/_storage.scss",
		);

		expect(scssFile.content).toContain(
			'--callout-icon: url("data:image/svg+xml;utf8,<svg><path d=\'M1 1\'/></svg>");',
		);
	});

	it("publishBatch rewrites quoted inline <svg> callout icon literals into data URIs", async () => {
		const app = new App();
		const settings = makeSettings({
			manageSyncerStyles: true,
			useCssSnippets: true,
			copyCssSnippets: ["storage.css"],
		});
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
		} as unknown as DataStore;
		const quartzFileSource = {
			readFile: vi.fn().mockResolvedValue(null),
			writeFile: vi.fn(),
			writeBinaryFile: vi.fn(),
			deleteFile: vi.fn(),
			listDirectory: vi.fn().mockResolvedValue([]),
			listAllFiles: vi.fn().mockResolvedValue([]),
			exists: vi.fn().mockResolvedValue(false),
		};

		vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
			new Map(),
		);
		app.vault.adapter.list = vi.fn().mockResolvedValue({
			files: [".obsidian/snippets/storage.css"],
			folders: [],
		});
		app.vault.adapter.read = vi.fn().mockResolvedValue(
			'.callout[data-callout="storage-callout"] {\n' +
				"\t--callout-color: 132, 0, 192;\n" +
				'\t--callout-icon: \'<svg><path d="M1 1"/></svg>\';\n' +
				"}",
		);

		const backend = new RemotePublishBackend(gitBackend, "main");
		const publisher = new Publisher(
			app,
			plugin,
			backend,
			compiler,
			dataStore,
			undefined,
			undefined,
			quartzFileSource,
		);

		const file = makePublishFile("notes/a.md");
		await publisher.publishBatch([file]);

		expect(getIcon).not.toHaveBeenCalled();

		const [, , stagedFiles] = gitBackend.writeFiles.mock.calls[0];
		const scssFile = stagedFiles.find(
			(f: { path: string }) =>
				f.path === "quartz/styles/syncer/_storage.scss",
		);

		expect(scssFile.content).toContain(
			'--callout-icon: url("data:image/svg+xml;utf8,<svg><path d=\'M1 1\'/></svg>");',
		);
	});

	it("publishBatch does not store remote hash when writeFiles rejects", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			writeFiles: vi.fn().mockRejectedValue(new Error("push failed")),
		});
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
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

		expect(dataStore.storeRemoteHash).not.toHaveBeenCalled();
	});

	it("publishBatch stores remote hash only after successful writeFiles", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			writeFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
		});
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
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

		await publisher.publishBatch([makePublishFile("notes/a.md")]);

		expect(dataStore.storeRemoteHash).toHaveBeenCalledWith(
			"notes/a.md",
			1234,
			"sha-1",
		);

		const writeOrder = vi.mocked(gitBackend.writeFiles).mock
			.invocationCallOrder[0]!;
		const storeOrder = vi.mocked(dataStore.storeRemoteHash).mock
			.invocationCallOrder[0]!;
		expect(writeOrder).toBeLessThan(storeOrder);

		nowSpy.mockRestore();
	});

	it("publishBatch refreshes tree cache", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
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
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			loadLocalFile: vi.fn().mockResolvedValue(["hello", { blobs: [] }]),
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
			storeRemoteHash: vi.fn(),
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

	it("deleteBatch calls deleteFiles with mapped paths", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend();
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			preloadCache: vi.fn().mockResolvedValue(undefined),
			flushCache: vi.fn().mockResolvedValue(undefined),
			clearMemoryCache: vi.fn(),
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

		expect(mockQueue.pause).toHaveBeenCalled();
		expect(mockQueue.resume).toHaveBeenCalled();

		const pauseOrder = mockQueue.pause.mock.invocationCallOrder[0]!;
		const resumeOrder = mockQueue.resume.mock.invocationCallOrder[0]!;

		expect(pauseOrder).toBeLessThan(resumeOrder);
	});

	it("resumes compilationQueue even when getPublishStatus throws", async () => {
		const app = new App();
		const settings = makeSettings();
		const plugin = makePlugin(settings);
		const gitBackend = makeGitBackend({
			readTree: vi.fn().mockRejectedValue(new Error("network error")),
		});
		const compiler = {} as SyncerPageCompiler;
		const dataStore = {
			preloadCache: vi.fn().mockResolvedValue(undefined),
			flushCache: vi.fn().mockResolvedValue(undefined),
			clearMemoryCache: vi.fn(),
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

		expect(mockQueue.resume).toHaveBeenCalled();
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
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
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
		const compiler = {} as SyncerPageCompiler;
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
});
