/**
 * Layer 2: Compiler step unit tests.
 *
 * Each compiler step is tested in isolation with mocked Obsidian APIs.
 * During migration to remark-obsidian, the step implementations change
 * but these behavioral contracts must hold.
 */

import { SyncerPageCompiler } from "./SyncerPageCompiler";
import { App, MetadataCache, Vault, TFile } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";
import { DataStore } from "src/publishFile/DataStore";

jest.mock("src/publishFile/DataStore");

function makeSettings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return {
		vaultPath: "/",
		applyEmbeds: true,
		useExcalidraw: false,
		useDataview: false,
		usePermalink: false,
		includeAllFrontmatter: false,
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		showPublishedTimestamp: false,
		publishFrontmatterKey: "publish",
		allNotesPublishableByDefault: false,
		contentFolder: "content",
		useFullResolutionImages: false,
		pathRewriteRules: "",
		createdTimestampKey: "created",
		updatedTimestampKey: "updated",
		publishedTimestampKey: "published",
		timestampFormat: "YYYY-MM-DD",
		frontmatterFormat: "yaml",
		useCache: false,
		syncCache: false,
		persistCache: false,
		cacheTimestamp: 0,
		cache: "",
		useAutoCardLink: false,
		useDatacore: false,
		useFantasyStatblocks: false,
		useBases: false,
		useCanvas: false,
		useThemes: false,
		manageSyncerStyles: false,
		noteSettingsIsInitialized: false,
		lastUsedSettingsTab: "",
		pluginVersion: "0.0.0",
		diffViewStyle: "auto",
		git: {
			remoteUrl: "",
			branch: "main",
			auth: { type: "none" },
		},
		...overrides,
	} as QuartzSyncerSettings;
}

function makeCompiler(
	settingsOverrides: Partial<QuartzSyncerSettings> = {},
	metadataCache?: MetadataCache,
) {
	const app = new App();
	const vault = new Vault();
	const settings = makeSettings(settingsOverrides);
	const mc = metadataCache ?? new MetadataCache();
	const datastore = {} as DataStore;
	const getFilesMarkedForPublishing = jest.fn().mockResolvedValue({
		notes: [],
	});

	const compiler = new SyncerPageCompiler(
		app as any,
		vault as any,
		settings,
		mc as any,
		datastore,
		getFilesMarkedForPublishing,
	);

	return { compiler, vault, metadataCache: mc, settings, app };
}

function makeMockPublishFile(
	overrides: Partial<{
		path: string;
		name: string;
		extension: string;
		frontmatter: Record<string, unknown>;
		cachedReadValue: string;
		compiledFrontmatter: string;
	}> = {},
) {
	const path = overrides.path ?? "notes/test.md";
	const name = overrides.name ?? "test.md";

	return {
		file: {
			path,
			name,
			extension: overrides.extension ?? "md",
			stat: { mtime: 0, ctime: 0, size: 0 },
			basename: name.replace(/\.[^.]+$/, ""),
			parent: null,
		} as unknown as TFile,
		getPath: jest.fn().mockReturnValue(path),
		getVaultPath: jest.fn().mockReturnValue(path),
		getType: jest.fn().mockReturnValue("markdown"),
		cachedRead: jest
			.fn()
			.mockResolvedValue(overrides.cachedReadValue ?? ""),
		getCompiledFrontmatter: jest
			.fn()
			.mockReturnValue(
				overrides.compiledFrontmatter ?? "---\npublish: true\n---\n",
			),
		getFrontmatter: jest.fn().mockReturnValue(overrides.frontmatter ?? {}),
		getMetadata: jest.fn().mockReturnValue({}),
		getBlock: jest.fn().mockReturnValue(undefined),
		meta: {
			getCreatedAt: jest.fn().mockReturnValue(null),
			getUpdatedAt: jest.fn().mockReturnValue(null),
			getPublishedAt: jest.fn().mockReturnValue(null),
		},
		settings: makeSettings(),
		metadataCache: new MetadataCache(),
		vault: new Vault(),
		compiler: {},
		frontmatter: overrides.frontmatter ?? {},
		datastore: {} as DataStore,
	} as unknown as PublishFile;
}

describe("SyncerPageCompiler", () => {
	describe("removeObsidianComments", () => {
		it("removes a single-line comment", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = compiler.removeObsidianComments(file)(
				"Hello %%hidden%% world",
			);

			expect(result).toBe("Hello  world");
		});

		it("removes a multi-line comment", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = compiler.removeObsidianComments(file)(
				"Before\n%%\nThis is a\nmultiline comment\n%%\nAfter",
			);

			expect(result).toBe("Before\n\nAfter");
		});

		it("preserves comments inside code blocks", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const input = "```\n%%keep me%%\n```";
			const result = compiler.removeObsidianComments(file)(input);

			expect(result).toBe(input);
		});

		it("preserves comments inside code fences", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const input = "```javascript\n%%keep me%%\n```";
			const result = compiler.removeObsidianComments(file)(input);

			expect(result).toBe(input);
		});

		it("returns text unchanged when no comments exist", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const input = "No comments here, just text.";
			const result = compiler.removeObsidianComments(file)(input);

			expect(result).toBe(input);
		});

		it("removes multiple comments in one text", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = compiler.removeObsidianComments(file)(
				"A %%one%% B %%two%% C",
			);

			expect(result).toBe("A  B  C");
		});
	});

	describe("linkTargeting", () => {
		it("removes target=_blank from dataview links", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const input =
				'<a data-tooltip-position="top" aria-label="Note" data-href="Note" href="Note" class="internal-link" target="_blank" rel="noopener">Note</a>';

			const result = compiler.linkTargeting(file)(input);

			expect(result).not.toContain('target="_blank" rel="noopener"');
		});

		it("returns text unchanged when no target attributes exist", () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const input = "Plain text with no links";
			const result = compiler.linkTargeting(file)(input);

			expect(result).toBe(input);
		});
	});

	describe("applyVaultPath", () => {
		it("strips vault path from wikilinks", () => {
			const { compiler } = makeCompiler({ vaultPath: "garden/" });
			const file = makeMockPublishFile();

			const result = compiler.applyVaultPath(file)(
				"See [[garden/my-note]]",
			);

			expect(result).toBe("See [[my-note]]");
		});

		it("strips vault path from markdown links", () => {
			const { compiler } = makeCompiler({ vaultPath: "garden/" });
			const file = makeMockPublishFile();

			const result = compiler.applyVaultPath(file)(
				"See [My Note](garden/my-note)",
			);

			expect(result).toBe("See [My Note](my-note)");
		});

		it("does nothing when vaultPath is root", () => {
			const { compiler } = makeCompiler({ vaultPath: "/" });
			const file = makeMockPublishFile();

			const input = "See [[some/note]]";
			const result = compiler.applyVaultPath(file)(input);

			expect(result).toBe(input);
		});

		it("does nothing when vaultPath is empty", () => {
			const { compiler } = makeCompiler({ vaultPath: "" });
			const file = makeMockPublishFile();

			const input = "See [[some/note]]";
			const result = compiler.applyVaultPath(file)(input);

			expect(result).toBe(input);
		});

		it("handles multiple links in one text", () => {
			const { compiler } = makeCompiler({ vaultPath: "docs/" });
			const file = makeMockPublishFile();

			const result = compiler.applyVaultPath(file)(
				"[[docs/a]] and [[docs/b]]",
			);

			expect(result).toBe("[[a]] and [[b]]");
		});
	});

	describe("convertFrontMatter", () => {
		it("replaces frontmatter with compiled version", () => {
			const { compiler } = makeCompiler();

			const file = makeMockPublishFile({
				compiledFrontmatter: "---\npublish: true\ntitle: Test\n---\n",
			});

			const input = "---\ndraft: true\n---\n\nBody content here.";

			const result = compiler.convertFrontMatter(file)(input);

			expect(result).toContain("publish: true");
			expect(result).toContain("title: Test");
			expect(result).toContain("Body content here.");
			expect(result).not.toContain("draft: true");
		});

		it("returns text unchanged when no frontmatter exists", () => {
			const { compiler } = makeCompiler();

			const file = makeMockPublishFile({
				compiledFrontmatter: "---\npublish: true\n---\n",
			});

			const input = "Just body content, no frontmatter.";
			const result = compiler.convertFrontMatter(file)(input);

			expect(result).toBe(input);
		});
	});

	describe("convertLinksToFullPath", () => {
		it("resolves a wikilink to its full path", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "folder/subfolder/target.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile({ path: "notes/source.md" });

			const input = "See [[target]] for details.";
			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toBe("See [[folder/subfolder/target]] for details.");
		});

		it("preserves header anchors in links", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "folder/target.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const input = "See [[target#section]] for details.";
			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toBe("See [[folder/target#section]] for details.");
		});

		it("preserves display names in links", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "folder/target.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const input = "See [[target|My Display Name]] for details.";
			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toBe(
				"See [[folder/target\\|My Display Name]] for details.",
			);
		});

		it("leaves unresolvable links unchanged", async () => {
			const mc = new MetadataCache();
			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(null);

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const input = "See [[nonexistent]] for details.";
			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toBe("See [[nonexistent]] for details.");
		});

		it("skips links inside code fences", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "resolved.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const input =
				"```\n[[should-not-resolve]]\n```\n\n[[target]] outside";

			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toContain("[[resolved]]");
			expect(result).toContain("```\n[[should-not-resolve]]\n```");
		});

		it("skips links inside frontmatter", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "resolved.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const input =
				'---\ntitle: "[[not-a-link]]"\n---\n\nBody with [[target]]';

			const result = await compiler.convertLinksToFullPath(file)(input);

			expect(result).toContain("Body with [[resolved]]");
		});
	});

	describe("extractBlobLinks", () => {
		it("extracts transcluded image paths", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "attachments/photo.png",
			});

			const { compiler } = makeCompiler({}, mc);

			const file = makeMockPublishFile({
				cachedReadValue: "![[photo.png]]",
			});

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/photo.png");
		});

		it("extracts markdown-style image paths", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "attachments/photo.jpg",
			});

			const { compiler } = makeCompiler({}, mc);

			const file = makeMockPublishFile({
				cachedReadValue: "![alt](photo.jpg)",
			});

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/photo.jpg");
		});

		it("skips http URLs in markdown-style images", async () => {
			const mc = new MetadataCache();

			const { compiler } = makeCompiler({}, mc);

			const file = makeMockPublishFile({
				cachedReadValue: "![alt](https://example.com/photo.jpg)",
			});

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toHaveLength(0);
		});

		it("strips anchors before resolving blob paths", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "doc.pdf") {
						return { path: "attachments/doc.pdf" };
					}

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);

			const file = makeMockPublishFile({
				cachedReadValue: "![[doc.pdf#page=3]]",
			});

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/doc.pdf");
		});

		it("handles multiple blobs in one file", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "a.png") return { path: "img/a.png" };
					if (path === "b.jpg") return { path: "img/b.jpg" };

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);

			const file = makeMockPublishFile({
				cachedReadValue: "![[a.png]] and ![[b.jpg]]",
			});

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("img/a.png");
			expect(assets).toContain("img/b.jpg");
			expect(assets).toHaveLength(2);
		});

		it("extracts file references from canvas nodes", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "notes/card.md") {
						return { path: "notes/card.md" };
					}

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);

			const canvasJson = JSON.stringify({
				nodes: [{ type: "file", file: "notes/card.md" }],
			});

			const file = makeMockPublishFile({
				cachedReadValue: canvasJson,
			});

			(file.getType as jest.Mock).mockReturnValue("canvas");

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("notes/card.md");
		});
	});

	describe("runCompilerSteps", () => {
		it("chains multiple steps in order", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const step1 = () => (text: string) => text + " [step1]";
			const step2 = () => (text: string) => text + " [step2]";

			const result = await compiler.runCompilerSteps(file, [
				step1,
				step2,
			])("input");

			expect(result).toBe("input [step1] [step2]");
		});

		it("handles async steps", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const asyncStep = () => async (text: string) => text + " [async]";

			const result = await compiler.runCompilerSteps(file, [asyncStep])(
				"input",
			);

			expect(result).toBe("input [async]");
		});
	});
});
