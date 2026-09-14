import { describe, expect, it, vi } from "vitest";
import { App, MetadataCache, TFile, Vault } from "obsidian";
import { PublishFile, getSpecialFileType } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore, type QuartzSyncerCache } from "src/cache/DataStore";
import * as utils from "src/utils/utils";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import type QuartzSyncer from "src/main";

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: () => ({
		getItem: vi.fn().mockResolvedValue(null),
		setItem: vi.fn().mockResolvedValue(undefined),
	}),
}));

const baseSettings: QuartzSyncerSettings = {
	settingsSchemaVersion: 2,
	publishTarget: "remote",
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
	autoCleanOrphanedMedia: false,
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
	diffContextLines: 3,
	allowArbitraryFilePublishing: false,
	arbitraryPublishPaths: [],
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
	return new DataStore("vault", "app", "1.0.0");
}

describe("PublishFile", () => {
	it("background compilation persists output, links, and revisions in one write", async () => {
		const app = new App();
		const file = makeFile({
			path: "notes/test.md",
			name: "test.md",
			extension: "md",
		});
		app.vault.getFileByPath = vi.fn().mockReturnValue(file);
		app.vault.cachedRead = vi.fn().mockResolvedValue("content");
		app.metadataCache = makeMetadataCache({ publish: true });
		const datastore = makeDatastore();
		const plugin = {
			settings: baseSettings,
			dataStore: datastore,
		} as unknown as QuartzSyncer;
		const engine = new BackgroundEngine(app, plugin);
		const compiler = engine["getOrCreateCompiler"]();
		const generate = vi
			.spyOn(compiler, "generateMarkdown")
			.mockResolvedValue(["compiled", { blobs: [] }]);
		const links = vi
			.spyOn(compiler, "extractBlobLinks")
			.mockResolvedValue(["images/a.png"]);
		const hashSpy = vi.spyOn(utils, "generateBlobHash");
		try {
			await engine["compileFile"](
				file.path,
				new AbortController().signal,
			);
			expect(datastore.persister.getItem).toHaveBeenCalledExactlyOnceWith(
				"file:notes/test.md",
			);
			expect(datastore.persister.setItem).toHaveBeenCalledExactlyOnceWith(
				"file:notes/test.md",
				expect.objectContaining({
					localData: ["compiled", { blobs: [] }],
					mediaLinks: ["images/a.png"],
					sourceMtime: 2000,
				}),
			);
			expect(hashSpy).toHaveBeenCalledExactlyOnceWith("compiled");
		} finally {
			generate.mockRestore();
			links.mockRestore();
			hashSpy.mockRestore();
		}
	});

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
		vi.mocked(datastore.persister.getItem).mockResolvedValue({
			version: "1.0.0",
			sourceMtime: 2000,
			time: 2000,
			localData: compiledFile,
		});

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

	it("reads and writes once and hashes exactly once when compiling", async () => {
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

		const expectedHash = await utils.generateBlobHash("compiled");
		const hashSpy = vi.spyOn(utils, "generateBlobHash");
		try {
			await publishFile.compile();
			expect(hashSpy).toHaveBeenCalledExactlyOnceWith("compiled");
			expect(datastore.persister.getItem).toHaveBeenCalledExactlyOnceWith(
				"file:notes/test.md",
			);
			expect(datastore.persister.setItem).toHaveBeenCalledExactlyOnceWith(
				"file:notes/test.md",
				expect.objectContaining({
					localData: compiledFile,
					localHash: expectedHash,
					hasDynamicContent: false,
					sourceMtime: 2000,
					time: 2000,
				}),
			);
		} finally {
			hashSpy.mockRestore();
		}
	});

	it.each([
		{
			version: "old",
			mtime: 2000,
			dynamic: false,
			trust: false,
			hit: false,
		},
		{
			version: "1.0.0",
			mtime: 1000,
			dynamic: false,
			trust: false,
			hit: false,
		},
		{
			version: "1.0.0",
			mtime: 2000,
			dynamic: true,
			trust: false,
			hit: false,
		},
		{
			version: "1.0.0",
			mtime: 2000,
			dynamic: true,
			trust: true,
			hit: true,
		},
		{ version: "old", mtime: 2000, dynamic: true, trust: true, hit: false },
	])(
		"preserves cache validation: %j",
		async ({ version, mtime, dynamic, trust, hit }) => {
			const datastore = makeDatastore();
			vi.mocked(datastore.persister.getItem).mockResolvedValue({
				version,
				sourceMtime: mtime,
				hasDynamicContent: dynamic,
				localData: ["cached", { blobs: [] }],
			});
			const compiler = makeCompiler(["compiled", { blobs: [] }]);
			const vault = new Vault();
			vault.cachedRead = vi.fn().mockResolvedValue("content");
			const publishFile = new PublishFile({
				file: makeFile({
					path: "note.md",
					name: "note.md",
					extension: "md",
				}),
				compiler,
				metadataCache: makeMetadataCache(),
				vault,
				settings: baseSettings,
				datastore,
			});
			const hashSpy = vi.spyOn(utils, "generateBlobHash");
			try {
				const result = await publishFile.compile(trust);
				expect(result.getCompiledFile()[0]).toBe(
					hit ? "cached" : "compiled",
				);
				expect(hashSpy).toHaveBeenCalledTimes(hit ? 0 : 1);
				expect(datastore.persister.getItem).toHaveBeenCalledTimes(1);
				expect(datastore.persister.setItem).toHaveBeenCalledTimes(
					hit ? 0 : 1,
				);
			} finally {
				hashSpy.mockRestore();
			}
		},
	);

	it.each([false, true])(
		"consolidates background metadata and rejects mtime changes: %s",
		async (changeMtime) => {
			const datastore = makeDatastore();
			const file = makeFile({
				path: "notes/test.md",
				name: "test.md",
				extension: "md",
			});
			const vault = new Vault();
			vault.cachedRead = vi
				.fn()
				.mockResolvedValue("```dataview\nLIST\n```");
			const cached: QuartzSyncerCache = {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				remoteHash: "remote",
				datacoreRevision: 7,
			};
			const publishFile = new PublishFile({
				file,
				compiler: makeCompiler(["compiled", { blobs: [] }]),
				metadataCache: makeMetadataCache(),
				vault,
				settings: baseSettings,
				datastore,
			});
			const hashSpy = vi.spyOn(utils, "generateBlobHash");
			try {
				await publishFile.compile(false, {
					cachedEntry: cached,
					getMetadata: () => {
						if (changeMtime) file.stat.mtime = 3000;
						return Promise.resolve({
							mediaLinks: [],
							dataviewRevision: 42,
						});
					},
				});
				expect(hashSpy).toHaveBeenCalledExactlyOnceWith("compiled");
				expect(datastore.persister.getItem).not.toHaveBeenCalled();
				if (changeMtime) {
					expect(datastore.persister.setItem).not.toHaveBeenCalled();
				} else {
					expect(
						datastore.persister.setItem,
					).toHaveBeenCalledExactlyOnceWith(
						"file:notes/test.md",
						expect.objectContaining({
							localData: ["compiled", { blobs: [] }],
							mediaLinks: [],
							dataviewRevision: 42,
							datacoreRevision: 7,
							remoteHash: "remote",
							sourceMtime: 2000,
							hasDynamicContent: true,
						}),
					);
				}
			} finally {
				hashSpy.mockRestore();
			}
		},
	);

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

		expect(compiled).toMatch(/rating: ["']?5["']?/);
		expect(compiled).toContain("status: done");
		expect(compiled).toContain("other: thing");
		expect(compiled).toContain("title: Hello");
	});
});
