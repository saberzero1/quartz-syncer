import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	settingsSchemaVersion: 4,
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

const makeTFile = (path: string, extension?: string, name?: string): TFile => {
	const file = new TFile();
	file.path = path;
	file.extension = extension ?? path.split(".").pop() ?? "md";
	file.name = name ?? path.split("/").pop() ?? path;
	return file;
};

const makeApp = (
	markdownFiles: TFile[] = [],
	allFiles: TFile[] = [],
	frontmatterByPath: Record<string, Record<string, unknown>> = {},
): App => {
	const app = new App();

	const vaultStub = app.vault as typeof app.vault & {
		getFiles?: () => TFile[];
		getMarkdownFiles?: () => TFile[];
	};
	vaultStub.getFiles = vi.fn().mockReturnValue(allFiles);
	vaultStub.getMarkdownFiles = vi.fn().mockReturnValue(markdownFiles);

	const metaStub = app.metadataCache as typeof app.metadataCache & {
		getFileCache?: (
			file: TFile,
		) => { frontmatter: Record<string, unknown> } | null;
	};
	metaStub.getFileCache = vi.fn().mockImplementation((file: TFile) => {
		const fm = frontmatterByPath[file.path];
		return fm ? { frontmatter: fm } : null;
	});

	return app;
};

const makePlugin = (
	cacheHandle: QuartzSyncer["cacheHandle"] = null,
): QuartzSyncer =>
	({
		cacheHandle,
	}) as unknown as QuartzSyncer;

describe("collectCandidatePaths", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns only markdown paths when allNotesPublishableByDefault is true", () => {
		const markdownFiles = [
			makeTFile("notes/a.md"),
			makeTFile("notes/b.md"),
		];
		const files = [
			...markdownFiles,
			makeTFile("images/photo.png", "png"),
			makeTFile("documents/report.pdf", "pdf"),
		];
		const app = makeApp(markdownFiles, files);
		const settings = makeSettings({ allNotesPublishableByDefault: true });
		const plugin = makePlugin();

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result).toEqual(new Set(["notes/a.md", "notes/b.md"]));
		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"defaults an absent vault scope to the whole vault with allNotesPublishableByDefault=%s",
		(allNotesPublishableByDefault) => {
			const markdownFiles = [makeTFile("notes/a.md")];
			const app = makeApp(markdownFiles, markdownFiles, {
				"notes/a.md": { publish: true },
			});
			const settings = {
				...makeSettings({ allNotesPublishableByDefault }),
				vaultPath: undefined,
			} as unknown as QuartzSyncerSettings;

			const result = collectCandidatePaths(app, makePlugin(), settings);

			expect(result).toEqual(new Set(["notes/a.md"]));
		},
	);

	it.each(["notes", "notes/"])(
		"scopes all-notes candidates to %s on path boundaries",
		(vaultPath) => {
			const markdownFiles = [
				makeTFile("notes/a.md"),
				makeTFile("notes/nested/b.md"),
				makeTFile("notes-old/a.md"),
				makeTFile("private/a.md"),
			];
			const app = makeApp(markdownFiles, markdownFiles);

			const result = collectCandidatePaths(
				app,
				makePlugin(),
				makeSettings({ allNotesPublishableByDefault: true, vaultPath }),
			);

			expect(result).toEqual(
				new Set(["notes/a.md", "notes/nested/b.md"]),
			);
		},
	);

	it.each([
		{ useCanvas: false, useBases: false },
		{ useCanvas: true, useBases: false },
		{ useCanvas: false, useBases: true },
		{ useCanvas: true, useBases: true },
	])("includes only enabled special types in all-notes mode: %j", (flags) => {
		const markdownFiles = [makeTFile("notes/a.md")];
		const allFiles = [
			...markdownFiles,
			makeTFile("notes/board.canvas"),
			makeTFile("notes/table.base"),
			makeTFile("notes/photo.png"),
		];
		const app = makeApp(markdownFiles, allFiles);

		const result = collectCandidatePaths(
			app,
			makePlugin(),
			makeSettings({ allNotesPublishableByDefault: true, ...flags }),
		);

		const expected = new Set(["notes/a.md"]);

		if (flags.useCanvas) expected.add("notes/board.canvas");

		if (flags.useBases) expected.add("notes/table.base");

		expect(result).toEqual(expected);
		expect(app.vault.getFiles).toHaveBeenCalledTimes(
			flags.useCanvas || flags.useBases ? 1 : 0,
		);
	});

	it.each([false, true])(
		"gates both Excalidraw formats in all-notes mode with useExcalidraw=%s",
		(useExcalidraw) => {
			const markdownFiles = [
				makeTFile("notes/a.md"),
				makeTFile("notes/sketch.excalidraw.md"),
			];
			const allFiles = [
				...markdownFiles,
				makeTFile("notes/sketch.excalidraw"),
			];
			const app = makeApp(markdownFiles, allFiles);

			const result = collectCandidatePaths(
				app,
				makePlugin(),
				makeSettings({
					allNotesPublishableByDefault: true,
					useExcalidraw,
				}),
			);

			expect(result).toEqual(
				new Set(
					useExcalidraw
						? [
								"notes/a.md",
								"notes/sketch.excalidraw.md",
								"notes/sketch.excalidraw",
							]
						: ["notes/a.md"],
				),
			);
			expect(app.vault.getFiles).toHaveBeenCalledTimes(
				useExcalidraw ? 1 : 0,
			);
		},
	);

	it("scopes ready extended-cache candidates without mutating the index", () => {
		const indexedPaths = new Set([
			"notes/a.md",
			"notes/nested/b.md",
			"notes-old/a.md",
			"private/a.md",
		]);
		const extCacheApi = {
			isReady: true,
			getFilesWithFrontmatterValue: vi.fn().mockReturnValue(indexedPaths),
			on: vi.fn(),
			offref: vi.fn(),
		};
		const plugin = makePlugin({
			api: extCacheApi,
		} as unknown as QuartzSyncer["cacheHandle"]);
		const app = makeApp();

		const result = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ vaultPath: "notes" }),
		);

		expect(result).toEqual(new Set(["notes/a.md", "notes/nested/b.md"]));
		expect(indexedPaths.size).toBe(4);
		expect(app.vault.getMarkdownFiles).not.toHaveBeenCalled();
		expect(app.vault.getFiles).not.toHaveBeenCalled();
	});

	it.each(["missing", "not ready"])(
		"scopes metadata fallback before cache lookups when extended cache is %s",
		(cacheState) => {
			const markdownFiles = [
				makeTFile("notes/a.md"),
				makeTFile("notes/draft.md"),
				makeTFile("notes-old/a.md"),
				makeTFile("private/a.md"),
			];
			const app = makeApp(markdownFiles, markdownFiles, {
				"notes/a.md": { publish: true },
				"notes/draft.md": { publish: false },
				"notes-old/a.md": { publish: true },
				"private/a.md": { publish: true },
			});
			const plugin = makePlugin(
				cacheState === "missing"
					? null
					: ({
							api: { isReady: false },
						} as unknown as QuartzSyncer["cacheHandle"]),
			);

			const result = collectCandidatePaths(
				app,
				plugin,
				makeSettings({ vaultPath: "notes" }),
			);

			expect(result).toEqual(new Set(["notes/a.md"]));
			expect(app.metadataCache.getFileCache).toHaveBeenCalledTimes(2);
			expect(app.metadataCache.getFileCache).not.toHaveBeenCalledWith(
				markdownFiles[2],
			);
			expect(app.metadataCache.getFileCache).not.toHaveBeenCalledWith(
				markdownFiles[3],
			);
		},
	);

	it.each([false, true])(
		"scopes enabled special files with allNotesPublishableByDefault=%s",
		(allNotesPublishableByDefault) => {
			const allFiles = ["notes", "notes-old", "private"].flatMap(
				(folder) =>
					[
						"board.canvas",
						"table.base",
						"sketch.excalidraw",
						"sketch.excalidraw.md",
					].map((name) => makeTFile(`${folder}/${name}`)),
			);
			const app = makeApp(
				allFiles.filter((file) => file.extension === "md"),
				allFiles,
			);

			const result = collectCandidatePaths(
				app,
				makePlugin(),
				makeSettings({
					allNotesPublishableByDefault,
					vaultPath: "notes",
					useCanvas: true,
					useBases: true,
					useExcalidraw: true,
				}),
			);

			expect(result).toEqual(
				new Set([
					"notes/board.canvas",
					"notes/table.base",
					"notes/sketch.excalidraw",
					"notes/sketch.excalidraw.md",
				]),
			);
			expect(app.vault.getFiles).toHaveBeenCalledTimes(1);
		},
	);

	it("returns exactly the paths from extCache.getFilesWithFrontmatterValue when cache is ready", () => {
		const extCachePaths = new Set(["notes/a.md", "notes/b.md"]);
		const extCacheApi = {
			isReady: true,
			getFilesWithFrontmatterValue: vi
				.fn()
				.mockReturnValue(extCachePaths),
			on: vi.fn(),
			offref: vi.fn(),
		};
		const plugin = makePlugin({
			api: extCacheApi,
		} as unknown as QuartzSyncer["cacheHandle"]);

		const markdownFiles = [
			makeTFile("notes/a.md"),
			makeTFile("notes/b.md"),
			makeTFile("notes/c.md"),
		];
		const app = makeApp(markdownFiles, markdownFiles);
		const settings = makeSettings();

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result).toEqual(extCachePaths);
		expect(extCacheApi.getFilesWithFrontmatterValue).toHaveBeenCalledWith(
			"publish",
			true,
		);
	});

	it("falls back to metadataCache when cacheHandle is null, returning only published markdown files", () => {
		const markdownFiles: TFile[] = [];
		const frontmatterByPath: Record<string, Record<string, unknown>> = {};

		for (let i = 0; i < 100; i++) {
			const path = `notes/file-${i}.md`;
			markdownFiles.push(makeTFile(path));
			if (i < 3) {
				frontmatterByPath[path] = { publish: true };
			}
		}

		const app = makeApp(markdownFiles, [], frontmatterByPath);
		const plugin = makePlugin(null);

		const settings = makeSettings();

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result.size).toBe(3);
		expect(result.has("notes/file-0.md")).toBe(true);
		expect(result.has("notes/file-1.md")).toBe(true);
		expect(result.has("notes/file-2.md")).toBe(true);
		expect(result.has("notes/file-3.md")).toBe(false);
		expect(result.has("notes/file-99.md")).toBe(false);
	});

	it("falls back to metadataCache when extCache.isReady is false, returning only published markdown files", () => {
		const extCacheApi = {
			isReady: false,
			getFilesWithFrontmatterValue: vi
				.fn()
				.mockReturnValue(new Set<string>()),
			on: vi.fn(),
			offref: vi.fn(),
		};
		const plugin = makePlugin({
			api: extCacheApi,
		} as unknown as QuartzSyncer["cacheHandle"]);

		const markdownFiles: TFile[] = [];
		const frontmatterByPath: Record<string, Record<string, unknown>> = {};

		for (let i = 0; i < 100; i++) {
			const path = `notes/file-${i}.md`;
			markdownFiles.push(makeTFile(path));
			if (i < 3) {
				frontmatterByPath[path] = { publish: true };
			}
		}

		const app = makeApp(markdownFiles, [], frontmatterByPath);
		const settings = makeSettings();

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result.size).toBe(3);
		expect(extCacheApi.getFilesWithFrontmatterValue).not.toHaveBeenCalled();
	});

	it("does not call app.vault.getFiles when useBases, useCanvas, and useExcalidraw are all false", () => {
		const markdownFiles = [makeTFile("notes/a.md")];
		const app = makeApp(markdownFiles, [], {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);
		const settings = makeSettings({
			useBases: false,
			useCanvas: false,
			useExcalidraw: false,
		});

		collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).not.toHaveBeenCalled();
	});

	it("calls app.vault.getFiles when useCanvas is true", () => {
		const markdownFiles = [makeTFile("notes/a.md")];
		const allFiles = [
			...markdownFiles,
			makeTFile("diagrams/board.canvas", "canvas"),
		];
		const app = makeApp(markdownFiles, allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);
		const settings = makeSettings({
			useBases: false,
			useCanvas: true,
			useExcalidraw: false,
		});

		const result = collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalledTimes(1);
		expect(result).toEqual(
			new Set(["notes/a.md", "diagrams/board.canvas"]),
		);
	});

	it("calls app.vault.getFiles when useBases is true", () => {
		const markdownFiles = [makeTFile("notes/a.md")];
		const allFiles = [...markdownFiles, makeTFile("db/table.base", "base")];
		const app = makeApp(markdownFiles, allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);
		const settings = makeSettings({
			useBases: true,
			useCanvas: false,
			useExcalidraw: false,
		});

		const result = collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalledTimes(1);
		expect(result).toEqual(new Set(["notes/a.md", "db/table.base"]));
	});

	it("calls app.vault.getFiles when useExcalidraw is true", () => {
		const markdownFiles = [makeTFile("notes/a.md")];
		const exFile = makeTFile(
			"drawings/sketch.excalidraw.md",
			"md",
			"sketch.excalidraw.md",
		);
		const allFiles = [...markdownFiles, exFile];
		const app = makeApp(markdownFiles, allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);
		const settings = makeSettings({
			useBases: false,
			useCanvas: false,
			useExcalidraw: true,
		});

		const result = collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalledTimes(1);
		expect(result).toEqual(
			new Set(["notes/a.md", "drawings/sketch.excalidraw.md"]),
		);
	});

	it("includes .canvas file in results only when useCanvas is true", () => {
		const canvasFile = makeTFile("diagrams/board.canvas", "canvas");
		const mdFile = makeTFile("notes/a.md");
		const allFiles = [mdFile, canvasFile];
		const app = makeApp([mdFile], allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);

		const withCanvas = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useCanvas: true }),
		);
		const withoutCanvas = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useCanvas: false }),
		);

		expect(withCanvas.has("diagrams/board.canvas")).toBe(true);
		expect(withoutCanvas.has("diagrams/board.canvas")).toBe(false);
	});

	it("includes .base file in results only when useBases is true", () => {
		const baseFile = makeTFile("db/table.base", "base");
		const mdFile = makeTFile("notes/a.md");
		const allFiles = [mdFile, baseFile];
		const app = makeApp([mdFile], allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);

		const withBases = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useBases: true }),
		);
		const withoutBases = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useBases: false }),
		);

		expect(withBases.has("db/table.base")).toBe(true);
		expect(withoutBases.has("db/table.base")).toBe(false);
	});

	it("includes .excalidraw.md file in results only when useExcalidraw is true", () => {
		const exFile = makeTFile(
			"drawings/sketch.excalidraw.md",
			"md",
			"sketch.excalidraw.md",
		);
		const mdFile = makeTFile("notes/a.md");
		const allFiles = [mdFile, exFile];
		const app = makeApp([mdFile], allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);

		const withEx = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useExcalidraw: true }),
		);
		const withoutEx = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useExcalidraw: false }),
		);

		expect(withEx.has("drawings/sketch.excalidraw.md")).toBe(true);
		expect(withoutEx.has("drawings/sketch.excalidraw.md")).toBe(false);
	});

	it("includes .excalidraw file (standalone) in results only when useExcalidraw is true", () => {
		const exFile = makeTFile(
			"drawings/sketch.excalidraw",
			"excalidraw",
			"sketch.excalidraw",
		);
		const mdFile = makeTFile("notes/a.md");
		const allFiles = [mdFile, exFile];
		const app = makeApp([mdFile], allFiles, {
			"notes/a.md": { publish: true },
		});
		const plugin = makePlugin(null);

		const withEx = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useExcalidraw: true }),
		);
		const withoutEx = collectCandidatePaths(
			app,
			plugin,
			makeSettings({ useExcalidraw: false }),
		);

		expect(withEx.has("drawings/sketch.excalidraw")).toBe(true);
		expect(withoutEx.has("drawings/sketch.excalidraw")).toBe(false);
	});

	it("returns union of published markdown and enabled special files", () => {
		const mdPublished = makeTFile("notes/published.md");
		const mdDraft = makeTFile("notes/draft.md");
		const canvasFile = makeTFile("diagrams/board.canvas", "canvas");
		const baseFile = makeTFile("db/table.base", "base");
		const allFiles = [mdPublished, mdDraft, canvasFile, baseFile];

		const app = makeApp([mdPublished, mdDraft], allFiles, {
			"notes/published.md": { publish: true },
		});
		const plugin = makePlugin(null);
		const settings = makeSettings({
			useCanvas: true,
			useBases: false,
		});

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result.has("notes/published.md")).toBe(true);
		expect(result.has("diagrams/board.canvas")).toBe(true);
		expect(result.has("notes/draft.md")).toBe(false);
		expect(result.has("db/table.base")).toBe(false);
	});
});

describe("excluded folders", () => {
	it.each([false, true])(
		"overrides publication flags and all-notes mode (%s)",
		(allNotesPublishableByDefault) => {
			const files = [
				makeTFile("Private/journal.md"),
				makeTFile("Private/nested/note.md"),
				makeTFile("Private-ish/public.md"),
				makeTFile("Books/book.md"),
			];
			const app = makeApp(
				files,
				files,
				Object.fromEntries(
					files.map((file) => [file.path, { publish: true }]),
				),
			);
			expect(
				collectCandidatePaths(
					app,
					makePlugin(),
					makeSettings({
						allNotesPublishableByDefault,
						excludedFolders: "Private",
					}),
				),
			).toEqual(new Set(["Private-ish/public.md", "Books/book.md"]));
		},
	);

	it("filters the ready metadata index and enabled special files", () => {
		const files = [
			makeTFile("Private/table.base"),
			makeTFile("Private/board.canvas"),
			makeTFile("Private/drawing.excalidraw.md"),
			makeTFile("Public/table.base"),
		];
		const app = makeApp([], files);
		const cache = {
			api: {
				isReady: true,
				getFilesWithFrontmatterValue: () =>
					new Set(["Private/journal.md", "Books/book.md"]),
			},
		} as unknown as NonNullable<QuartzSyncer["cacheHandle"]>;
		expect(
			collectCandidatePaths(
				app,
				makePlugin(cache),
				makeSettings({
					excludedFolders: "Private",
					useBases: true,
					useCanvas: true,
					useExcalidraw: true,
				}),
			),
		).toEqual(new Set(["Books/book.md", "Public/table.base"]));
	});

	it("interprets exclusions relative to the vault, not the publishing root", () => {
		const files = [
			makeTFile("Garden/Private/note.md"),
			makeTFile("Garden/Public/note.md"),
		];
		expect(
			collectCandidatePaths(
				makeApp(files, files),
				makePlugin(),
				makeSettings({
					vaultPath: "Garden",
					allNotesPublishableByDefault: true,
					excludedFolders: "Garden/Private",
				}),
			),
		).toEqual(new Set(["Garden/Public/note.md"]));
	});
});
