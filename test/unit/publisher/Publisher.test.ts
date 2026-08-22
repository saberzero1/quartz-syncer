import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { Publisher } from "src/publisher/Publisher";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import type { GitBackend } from "src/git/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type QuartzSyncer from "src/main";
import type { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import type { DataStore } from "src/cache/DataStore";

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
});
