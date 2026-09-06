import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	settingsSchemaVersion: 4,
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

	it("returns every vault file path when allNotesPublishableByDefault is true", () => {
		const files = [
			makeTFile("notes/a.md"),
			makeTFile("notes/b.md"),
			makeTFile("images/photo.png", "png"),
		];
		const app = makeApp([], files);
		const settings = makeSettings({ allNotesPublishableByDefault: true });
		const plugin = makePlugin();

		const result = collectCandidatePaths(app, plugin, settings);

		expect(result).toEqual(
			new Set(["notes/a.md", "notes/b.md", "images/photo.png"]),
		);
		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalledTimes(1);
	});

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

		collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalled();
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

		collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalled();
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

		collectCandidatePaths(app, plugin, settings);

		expect(
			(app.vault as { getFiles?: () => TFile[] }).getFiles,
		).toHaveBeenCalled();
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
