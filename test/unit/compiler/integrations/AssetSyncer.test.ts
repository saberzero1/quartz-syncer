import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetSyncer } from "src/compiler/integrations/AssetSyncer";
import type QuartzSyncerSettings from "src/models/settings";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";

vi.mock("src/compiler/integrations/registry", () => ({
	integrationRegistry: {
		getCollectedAssets: vi.fn(),
	},
}));

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return { ...actual, Notice: vi.fn() };
});

import { integrationRegistry } from "src/compiler/integrations/registry";

const baseSettings: QuartzSyncerSettings = {
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
	diffContextLines: 3,
	allowArbitraryFilePublishing: false,
	arbitraryPublishPaths: [],
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: false,
};

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	...baseSettings,
	...overrides,
});

const makeFileSource = (
	overrides: Partial<QuartzFileSource> = {},
): QuartzFileSource =>
	({
		readFile: vi.fn().mockResolvedValue(null),
		writeFile: vi.fn().mockResolvedValue(undefined),
		writeBinaryFile: vi.fn().mockResolvedValue(undefined),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		listDirectory: vi.fn().mockResolvedValue([]),
		listAllFiles: vi.fn().mockResolvedValue([]),
		exists: vi.fn().mockResolvedValue(false),
		...overrides,
	}) as unknown as QuartzFileSource;

describe("AssetSyncer", () => {
	beforeEach(() => {
		vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
			new Map(),
		);
	});

	describe("collectAssets with manageSyncerStyles = false", () => {
		it("returns success: true with empty stage/delete when no existing syncer files", async () => {
			const settings = makeSettings({ manageSyncerStyles: false });
			const connection = makeFileSource({
				listDirectory: vi.fn().mockResolvedValue([]),
				readFile: vi.fn().mockResolvedValue(null),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.size).toBe(0);
			expect(result.filesToDelete).toHaveLength(0);
		});

		it("returns filesToDelete with syncer file paths when existing syncer files found", async () => {
			const settings = makeSettings({ manageSyncerStyles: false });
			const connection = makeFileSource({
				listAllFiles: vi
					.fn()
					.mockResolvedValue([
						"quartz/styles/syncer/_dataview.scss",
						"quartz/styles/syncer/_index.scss",
					]),
				readFile: vi.fn().mockResolvedValue(null),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToDelete).toContain(
				"quartz/styles/syncer/_dataview.scss",
			);
			expect(result.filesToDelete).toContain(
				"quartz/styles/syncer/_index.scss",
			);
			expect(result.filesToDelete).not.toContain(
				"quartz/styles/syncer/subdir",
			);
		});

		it("updates custom.scss to remove syncer import when import exists", async () => {
			const settings = makeSettings({ manageSyncerStyles: false });
			const existingCustomScss =
				'@use "./base";\n@use "./syncer";\n\n.my-style { color: red; }';
			const connection = makeFileSource({
				listDirectory: vi.fn().mockResolvedValue([]),
				readFile: vi.fn().mockResolvedValue(existingCustomScss),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				true,
			);
			const updatedContent = result.filesToStage.get(
				"quartz/styles/custom.scss",
			)!;
			expect(updatedContent).not.toContain('@use "./syncer"');
		});

		it("does not stage custom.scss when syncer import is not present", async () => {
			const settings = makeSettings({ manageSyncerStyles: false });
			const existingCustomScss =
				'@use "./base";\n\n.my-style { color: red; }';
			const connection = makeFileSource({
				listDirectory: vi.fn().mockResolvedValue([]),
				readFile: vi.fn().mockResolvedValue(existingCustomScss),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				false,
			);
		});
	});

	describe("collectAssets with manageSyncerStyles = true", () => {
		it("stages SCSS files and index when integrations have SCSS", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
				]),
			);
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue(null),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(
				result.filesToStage.has("quartz/styles/syncer/_dataview.scss"),
			).toBe(true);
			expect(
				result.filesToStage.has("quartz/styles/syncer/_index.scss"),
			).toBe(true);
		});

		it("does not generate index file when no integrations have SCSS", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map(),
			);
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue(null),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.size).toBe(0);
		});

		it("deletes syncer style files that are no longer produced this run", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
				]),
			);
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue(null),
				listAllFiles: vi
					.fn()
					.mockResolvedValue([
						"quartz/styles/syncer/_dataview.scss",
						"quartz/styles/syncer/_index.scss",
						"quartz/styles/syncer/_datacore.scss",
						"quartz/styles/syncer/star_wars_destiny.css",
					]),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.filesToDelete).toEqual(
				expect.arrayContaining([
					"quartz/styles/syncer/_datacore.scss",
					"quartz/styles/syncer/star_wars_destiny.css",
				]),
			);
			expect(result.filesToDelete).not.toContain(
				"quartz/styles/syncer/_dataview.scss",
			);
			expect(result.filesToDelete).not.toContain(
				"quartz/styles/syncer/_index.scss",
			);
		});

		it("stages binary snippet assets under the syncer directory verbatim", async () => {
			const settings = makeSettings({
				manageSyncerStyles: true,
				useCssSnippets: true,
			});
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map(),
			);
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue(null),
			});
			const fontData = new TextEncoder().encode("font-bytes").buffer;

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(
				connection,
				new Map([["star_wars_destiny.css", ".swdicon {}"]]),
				new Map([["fonts/swdestiny.ttf", fontData]]),
			);

			expect(
				result.binaryFilesToStage.get(
					"quartz/styles/syncer/fonts/swdestiny.ttf",
				),
			).toBe(fontData);
		});

		it("adds syncer import to custom.scss when import is missing", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
				]),
			);
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue('@use "./base";\n'),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				true,
			);
			const updatedContent = result.filesToStage.get(
				"quartz/styles/custom.scss",
			)!;
			expect(updatedContent).toContain('@use "./syncer"');
		});

		it("does not add duplicate syncer import when already present in custom.scss", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
				]),
			);
			const existingContent = '@use "./base";\n@use "./syncer";\n';
			const connection = makeFileSource({
				readFile: vi.fn().mockResolvedValue(existingContent),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				false,
			);
		});

		it("creates custom.scss with syncer import when file does not exist", async () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
				]),
			);
			const connection = makeFileSource({
				readFile: vi
					.fn()
					.mockRejectedValue(new Error("File not found")),
			});

			const syncer = new AssetSyncer(settings);
			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				true,
			);
			const content = result.filesToStage.get(
				"quartz/styles/custom.scss",
			)!;
			expect(content).toContain('@use "./syncer"');
		});
	});

	describe("getScssFiles", () => {
		it("returns map with proper paths for each integration with SCSS", () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					[
						"dataview",
						{
							scss: ".dataview { display: block; }",
						},
					],
					[
						"datacore",
						{
							scss: ".datacore { display: flex; }",
						},
					],
				]),
			);

			const syncer = new AssetSyncer(settings);
			const files = syncer.getScssFiles();

			expect(files.has("quartz/styles/syncer/_dataview.scss")).toBe(true);
			expect(files.has("quartz/styles/syncer/_datacore.scss")).toBe(true);
			expect(files.get("quartz/styles/syncer/_dataview.scss")).toBe(
				".dataview { display: block; }",
			);
			expect(files.get("quartz/styles/syncer/_datacore.scss")).toBe(
				".datacore { display: flex; }",
			);
		});

		it("generates _index.scss with @use imports for each integration", () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([
					["dataview", { scss: ".dataview {}" }],
					["datacore", { scss: ".datacore {}" }],
				]),
			);

			const syncer = new AssetSyncer(settings);
			const files = syncer.getScssFiles();

			expect(files.has("quartz/styles/syncer/_index.scss")).toBe(true);
			const indexContent = files.get("quartz/styles/syncer/_index.scss")!;
			expect(indexContent).toContain('@use "./dataview"');
			expect(indexContent).toContain('@use "./datacore"');
		});

		it("returns empty map when no integrations have SCSS", () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map(),
			);

			const syncer = new AssetSyncer(settings);
			const files = syncer.getScssFiles();

			expect(files.size).toBe(0);
		});

		it("does not generate _index.scss when no integrations have SCSS", () => {
			const settings = makeSettings({ manageSyncerStyles: true });
			vi.mocked(integrationRegistry.getCollectedAssets).mockReturnValue(
				new Map([["dataview", {}]]),
			);

			const syncer = new AssetSyncer(settings);
			const files = syncer.getScssFiles();

			expect(files.has("quartz/styles/syncer/_index.scss")).toBe(false);
		});
	});
});
