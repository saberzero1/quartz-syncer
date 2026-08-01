import { describe, expect, it, vi } from "vitest";
import { MetadataCache, TFile, Vault } from "obsidian";
import { PublishFile, getSpecialFileType } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import type { DataStore } from "src/cache/DataStore";

const baseSettings: QuartzSyncerSettings = {
	settingsSchemaVersion: 2,
	gitRemoteUrl: "",
	gitBranch: "v4",
	gitCorsProxyUrl: "",
	gitAuthType: "basic",
	gitAuthUsername: "",
	gitProviderHint: "github",
	vaultPath: "/",
	githubRepo: undefined,
	githubUserName: undefined,
	githubToken: undefined,
	contentFolder: "content",
	publishFrontmatterKey: "publish",
	allNotesPublishableByDefault: false,
	showCreatedTimestamp: true,
	showUpdatedTimestamp: true,
	showPublishedTimestamp: false,
	usePermalink: false,
	includeAllFrontmatter: false,
	frontmatterFormat: "yaml",
	createdTimestampKey: "created, created_at, date",
	updatedTimestampKey: "modified, lastmod, updated, last-modified",
	publishedTimestampKey: "published, publishDate, date",
	timestampFormat: "MMM dd, yyyy h:mm a",
	useCache: true,
	syncCache: true,
	persistCache: false,
	cacheTimestamp: 0,
	cache: "{}",
	useAutoCardLink: false,
	useDataview: true,
	useDatacore: false,
	useExcalidraw: false,
	useFantasyStatblocks: false,
	useBases: false,
	useCanvas: false,
	manageSyncerStyles: true,
	noteSettingsIsInitialized: false,
	lastUsedSettingsTab: "git",
	pluginVersion: "",
	lastUpstreamCommitSha: "",
	upgradeCheckStrategy: "version",
	diffViewStyle: "auto",
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: true,
	ENABLE_DEVELOPER_TOOLS: false,
};

function makeFile(options: {
	path: string;
	name: string;
	extension: string;
}): TFile {
	const file = new TFile();
	file.path = options.path;
	file.name = options.name;
	file.extension = options.extension;
	file.stat = { mtime: 2000, ctime: 1000, size: 0 };
	return file;
}

function makeMetadataCache(frontmatter: Record<string, unknown> = {}) {
	const metadataCache = new MetadataCache();
	metadataCache.getCache = vi.fn().mockReturnValue({ frontmatter });
	return metadataCache;
}

function makeCompiler(compiledFile: [string, { blobs: string[] }]) {
	return {
		generateMarkdown: vi.fn().mockResolvedValue(compiledFile),
		extractBlobLinks: vi.fn().mockResolvedValue(["blob-a"]),
	} as unknown as SyncerPageCompiler;
}

function makeDatastore() {
	return {
		loadLocalFile: vi.fn().mockResolvedValue(null),
		isLocalFileOutdated: vi.fn().mockResolvedValue(true),
		storeLocalFile: vi.fn().mockResolvedValue(undefined),
		storeLocalHash: vi.fn().mockResolvedValue(undefined),
	} as unknown as DataStore;
}

describe("PublishFile", () => {
	it("constructs from a TFile and pulls frontmatter", () => {
		const file = makeFile({
			path: "notes/test.md",
			name: "test.md",
			extension: "md",
		});
		const metadataCache = makeMetadataCache({ publish: true });
		const vault = new Vault();
		const compiler = makeCompiler(["content", { blobs: [] }]);
		const datastore = makeDatastore();
		const publishFile = new PublishFile({
			file,
			compiler,
			metadataCache,
			vault,
			settings: baseSettings,
			datastore,
		});

		expect(publishFile.frontmatter).toEqual({ publish: true });
	});

	it("detects special file types", () => {
		const baseFile = makeFile({
			path: "notes/one.base",
			name: "one.base",
			extension: "base",
		});
		const canvasFile = makeFile({
			path: "notes/two.canvas",
			name: "two.canvas",
			extension: "canvas",
		});
		const excalidrawFile = makeFile({
			path: "notes/three.excalidraw.md",
			name: "three.excalidraw.md",
			extension: "md",
		});

		expect(getSpecialFileType(baseFile)).toBe("base");
		expect(getSpecialFileType(canvasFile)).toBe("canvas");
		expect(getSpecialFileType(excalidrawFile)).toBe("excalidraw");
	});

	it("resolves file type correctly", () => {
		const metadataCache = makeMetadataCache({});
		const vault = new Vault();
		const compiler = makeCompiler(["content", { blobs: [] }]);
		const datastore = makeDatastore();

		const excalidrawFile = new PublishFile({
			file: makeFile({
				path: "notes/one.excalidraw.md",
				name: "one.excalidraw.md",
				extension: "md",
			}),
			compiler,
			metadataCache,
			vault,
			settings: baseSettings,
			datastore,
		});

		const baseFile = new PublishFile({
			file: makeFile({
				path: "notes/two.base",
				name: "two.base",
				extension: "base",
			}),
			compiler,
			metadataCache,
			vault,
			settings: baseSettings,
			datastore,
		});

		const canvasFile = new PublishFile({
			file: makeFile({
				path: "notes/three.canvas",
				name: "three.canvas",
				extension: "canvas",
			}),
			compiler,
			metadataCache,
			vault,
			settings: baseSettings,
			datastore,
		});

		const markdownFile = new PublishFile({
			file: makeFile({
				path: "notes/four.md",
				name: "four.md",
				extension: "md",
			}),
			compiler,
			metadataCache,
			vault,
			settings: baseSettings,
			datastore,
		});

		expect(excalidrawFile.getType()).toBe("excalidraw");
		expect(baseFile.getType()).toBe("base");
		expect(canvasFile.getType()).toBe("canvas");
		expect(markdownFile.getType()).toBe("markdown");
	});

	it("uses frontmatter flags for shouldPublish", () => {
		const metadataCache = makeMetadataCache({ publish: true });
		const file = makeFile({
			path: "notes/test.md",
			name: "test.md",
			extension: "md",
		});
		const publishFile = new PublishFile({
			file,
			compiler: makeCompiler(["content", { blobs: [] }]),
			metadataCache,
			vault: new Vault(),
			settings: { ...baseSettings, allNotesPublishableByDefault: false },
			datastore: makeDatastore(),
		});

		expect(publishFile.shouldPublish()).toBe(true);
	});

	it("respects integration toggles for special file publishing", () => {
		const metadataCache = makeMetadataCache({});
		const vault = new Vault();
		const compiler = makeCompiler(["content", { blobs: [] }]);
		const datastore = makeDatastore();

		const baseFile = new PublishFile({
			file: makeFile({
				path: "notes/one.base",
				name: "one.base",
				extension: "base",
			}),
			compiler,
			metadataCache,
			vault,
			settings: { ...baseSettings, useBases: true },
			datastore,
		});

		const canvasFile = new PublishFile({
			file: makeFile({
				path: "notes/two.canvas",
				name: "two.canvas",
				extension: "canvas",
			}),
			compiler,
			metadataCache,
			vault,
			settings: { ...baseSettings, useCanvas: true },
			datastore,
		});

		const excalidrawFile = new PublishFile({
			file: makeFile({
				path: "notes/three.excalidraw.md",
				name: "three.excalidraw.md",
				extension: "md",
			}),
			compiler,
			metadataCache,
			vault,
			settings: { ...baseSettings, useExcalidraw: true },
			datastore,
		});

		expect(baseFile.shouldPublish()).toBe(true);
		expect(canvasFile.shouldPublish()).toBe(true);
		expect(excalidrawFile.shouldPublish()).toBe(true);
	});

	it("reads content through vault.cachedRead", async () => {
		const vault = new Vault();
		vault.cachedRead = vi.fn().mockResolvedValue("hello");
		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler: makeCompiler(["content", { blobs: [] }]),
			metadataCache: makeMetadataCache({}),
			vault,
			settings: baseSettings,
			datastore: makeDatastore(),
		});

		await expect(publishFile.cachedRead()).resolves.toBe("hello");
		expect(vault.cachedRead).toHaveBeenCalledWith(publishFile.file);
	});

	it("uses vault path rewrites", () => {
		const publishFile = new PublishFile({
			file: makeFile({
				path: "/vault/notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler: makeCompiler(["content", { blobs: [] }]),
			metadataCache: makeMetadataCache({}),
			vault: new Vault(),
			settings: { ...baseSettings, vaultPath: "/vault" },
			datastore: makeDatastore(),
		});

		expect(publishFile.getVaultPath()).toBe("/notes/test.md");
	});

	it("exposes metadata and block lookups", () => {
		const metadataCache = new MetadataCache();
		metadataCache.getCache = vi
			.fn()
			.mockReturnValue({ blocks: { abc: { id: "abc" } } });

		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler: makeCompiler(["content", { blobs: [] }]),
			metadataCache,
			vault: new Vault(),
			settings: baseSettings,
			datastore: makeDatastore(),
		});

		expect(publishFile.getMetadata()).toEqual({
			blocks: { abc: { id: "abc" } },
		});
		expect(publishFile.getBlock("abc")).toEqual({ id: "abc" });
	});

	it("compiles without cache", async () => {
		const compiledFile: [string, { blobs: string[] }] = [
			"compiled",
			{ blobs: [] },
		];
		const compiler = makeCompiler(compiledFile);
		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler,
			metadataCache: makeMetadataCache({}),
			vault: new Vault(),
			settings: { ...baseSettings, useCache: false },
			datastore: makeDatastore(),
		});

		const compiled = await publishFile.compile();

		expect(compiler.generateMarkdown).toHaveBeenCalledWith(publishFile);
		expect(compiled.getCompiledFile()).toEqual(compiledFile);
	});

	it("uses cached compiled output when available", async () => {
		const compiledFile: [string, { blobs: string[] }] = [
			"cached",
			{ blobs: [] },
		];
		const compiler = makeCompiler(compiledFile);
		const datastore = makeDatastore();
		datastore.loadLocalFile = vi.fn().mockResolvedValue(compiledFile);
		datastore.isLocalFileOutdated = vi.fn().mockResolvedValue(false);

		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler,
			metadataCache: makeMetadataCache({}),
			vault: new Vault(),
			settings: { ...baseSettings, useCache: true },
			datastore,
		});

		const compiled = await publishFile.compile();

		expect(compiler.generateMarkdown).not.toHaveBeenCalled();
		expect(compiled.getCompiledFile()).toEqual(compiledFile);
	});

	it("writes compiled output to cache when outdated", async () => {
		const compiledFile: [string, { blobs: string[] }] = [
			"compiled",
			{ blobs: [] },
		];
		const compiler = makeCompiler(compiledFile);
		const datastore = makeDatastore();
		const vault = new Vault();
		vault.cachedRead = vi.fn().mockResolvedValue("content");

		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler,
			metadataCache: makeMetadataCache({}),
			vault,
			settings: { ...baseSettings, useCache: true },
			datastore,
		});

		await publishFile.compile();

		expect(datastore.storeLocalFile).toHaveBeenCalled();
		expect(datastore.storeLocalHash).toHaveBeenCalled();
	});

	it("extracts blob links from compiler", async () => {
		const compiler = makeCompiler(["content", { blobs: [] }]);
		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler,
			metadataCache: makeMetadataCache({}),
			vault: new Vault(),
			settings: baseSettings,
			datastore: makeDatastore(),
		});

		await expect(publishFile.getBlobLinks()).resolves.toEqual(["blob-a"]);
		expect(compiler.extractBlobLinks).toHaveBeenCalledWith(publishFile);
	});

	it("compiles frontmatter with dataview fields", () => {
		const metadataCache = makeMetadataCache({ title: "Hello" });
		const publishFile = new PublishFile({
			file: makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			}),
			compiler: makeCompiler(["content", { blobs: [] }]),
			metadataCache,
			vault: new Vault(),
			settings: {
				...baseSettings,
				useDataview: true,
				includeAllFrontmatter: true,
			},
			datastore: makeDatastore(),
		});

		const compiled = publishFile.getCompiledFrontmatter(
			"rating:: 5\n[status:: done]\n(other:: thing)",
		);

		expect(compiled).toContain("rating: 5");
		expect(compiled).toContain("status: done");
		expect(compiled).toContain("other: thing");
		expect(compiled).toContain("title: Hello");
	});
});
