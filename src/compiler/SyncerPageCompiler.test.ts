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

	const compiler = new SyncerPageCompiler(
		app,
		vault,
		settings,
		mc,
		datastore,
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
	describe("astTransform — comment stripping", () => {
		it("removes a single-line comment", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"Hello %%hidden%% world",
			);

			expect(result.trim()).toBe("Hello  world");
		});

		it("removes a multi-line comment", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"Before\n%%\nThis is a\nmultiline comment\n%%\nAfter",
			);

			expect(result).toContain("Before");
			expect(result).toContain("After");
			expect(result).not.toContain("multiline comment");
		});

		it("preserves comments inside code blocks", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"```\n%%keep me%%\n```",
			);

			expect(result).toContain("%%keep me%%");
		});

		it("preserves comments inside code fences", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"```javascript\n%%keep me%%\n```",
			);

			expect(result).toContain("%%keep me%%");
		});

		it("returns text unchanged when no comments exist", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"No comments here, just text.",
			);

			expect(result.trim()).toBe("No comments here, just text.");
		});

		it("removes multiple comments in one text", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"A %%one%% B %%two%% C",
			);

			expect(result).toContain("A");
			expect(result).toContain("B");
			expect(result).toContain("C");
			expect(result).not.toContain("one");
			expect(result).not.toContain("two");
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

	describe("astTransform — vault path stripping", () => {
		it("strips vault path from markdown links", async () => {
			const { compiler } = makeCompiler({ vaultPath: "garden/" });
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"See [My Note](garden/my-note)",
			);

			expect(result).toContain("[My Note](my-note)");
		});

		it("strips vault path from markdown images", async () => {
			const { compiler } = makeCompiler({ vaultPath: "garden/" });
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"![Alt](garden/img.png)",
			);

			expect(result).toContain("![Alt](img.png)");
		});

		it("does nothing when vaultPath is root", async () => {
			const { compiler } = makeCompiler({ vaultPath: "/" });
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"See [My Note](some/note)",
			);

			expect(result).toContain("[My Note](some/note)");
		});

		it("does nothing when vaultPath is empty", async () => {
			const { compiler } = makeCompiler({ vaultPath: "" });
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"See [My Note](some/note)",
			);

			expect(result).toContain("[My Note](some/note)");
		});
	});

	describe("astTransform — callout unescaping", () => {
		it("unescapes a basic callout", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> [!note] Title\n> Content",
			);

			expect(result).toContain("> [!note] Title");
			expect(result).not.toContain("\\[");
		});

		it("unescapes a nested callout", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> > [!warning] Nested\n> > Content",
			);

			expect(result).toContain("> > [!warning] Nested");
			expect(result).not.toContain("\\[");
		});

		it("unescapes a callout with pipe-separated metadata", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> [!columns|no-title 3]\n> Content",
			);

			expect(result).toContain("> [!columns|no-title 3]");
			expect(result).not.toContain("\\[");
		});

		it("unescapes a nested callout with pipe-separated metadata", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> > [!columns|no-title 3]\n> > Content",
			);

			expect(result).toContain("> > [!columns|no-title 3]");
			expect(result).not.toContain("\\[");
		});

		it("unescapes a foldable callout with metadata", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> [!note|wide]+ Foldable\n> Content",
			);

			expect(result).toContain("> [!note|wide]+ Foldable");
			expect(result).not.toContain("\\[");
		});
	});

	describe("astTransform — footnote unescaping", () => {
		it("unescapes an inline footnote reference", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"Some text [^1] more text",
			);

			expect(result).toContain("[^1]");
			expect(result).not.toContain("\\[^1]");
		});

		it("unescapes a footnote definition", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"[^1]: This is a footnote",
			);

			expect(result).toContain("[^1]:");
			expect(result).not.toContain("\\[^1]:");
		});

		it("unescapes a footnote reference inside a callout", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"> [!note] Title\n> Content with [^1] ref",
			);

			expect(result).toContain("[^1]");
			expect(result).not.toContain("\\[^1]");
			expect(result).toContain("[!note]");
			expect(result).not.toContain("\\[!note]");
		});

		it("unescapes a named footnote reference", async () => {
			const { compiler } = makeCompiler();
			const file = makeMockPublishFile();

			const result = await compiler.astTransform(file)(
				"See this [^my-note] for details",
			);

			expect(result).toContain("[^my-note]");
			expect(result).not.toContain("\\[^my-note]");
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

	describe("extractBlobLinks", () => {
		it("extracts transcluded image paths", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [{ link: "photo.png", original: "![[photo.png]]" }],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "attachments/photo.png",
				extension: "png",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/photo.png");
		});

		it("extracts markdown-style image paths", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [{ link: "photo.jpg", original: "![alt](photo.jpg)" }],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "attachments/photo.jpg",
				extension: "jpg",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/photo.jpg");
		});

		it("skips embeds that resolve to non-asset files", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [{ link: "note", original: "![[note]]" }],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue({
				path: "notes/note.md",
				extension: "md",
			});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toHaveLength(0);
		});

		it("skips embeds that do not resolve", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [
					{
						link: "nonexistent.png",
						original: "![[nonexistent.png]]",
					},
				],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(null);

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toHaveLength(0);
		});

		it("resolves embeds with anchors stripped by Obsidian", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [{ link: "doc.pdf", original: "![[doc.pdf#page=3]]" }],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "doc.pdf") {
						return {
							path: "attachments/doc.pdf",
							extension: "pdf",
						};
					}

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("attachments/doc.pdf");
		});

		it("handles multiple blobs in one file", async () => {
			const mc = new MetadataCache();

			(mc.getCache as jest.Mock).mockReturnValue({
				embeds: [
					{ link: "a.png", original: "![[a.png]]" },
					{ link: "b.jpg", original: "![[b.jpg]]" },
				],
			});

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "a.png")
						return { path: "img/a.png", extension: "png" };

					if (path === "b.jpg")
						return { path: "img/b.jpg", extension: "jpg" };

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("img/a.png");
			expect(assets).toContain("img/b.jpg");
			expect(assets).toHaveLength(2);
		});

		it("extracts asset references from canvas nodes", async () => {
			const mc = new MetadataCache();

			(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
				(path: string) => {
					if (path === "img/diagram.png") {
						return {
							path: "img/diagram.png",
							extension: "png",
						};
					}

					if (path === "notes/card.md") {
						return {
							path: "notes/card.md",
							extension: "md",
						};
					}

					return null;
				},
			);

			const { compiler } = makeCompiler({}, mc);

			const canvasJson = JSON.stringify({
				nodes: [
					{ type: "file", file: "img/diagram.png" },
					{ type: "file", file: "notes/card.md" },
					{ type: "text", text: "some text" },
				],
			});

			const file = makeMockPublishFile({
				cachedReadValue: canvasJson,
			});

			(file.getType as jest.Mock).mockReturnValue("canvas");

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toContain("img/diagram.png");
			expect(assets).not.toContain("notes/card.md");
			expect(assets).toHaveLength(1);
		});

		it("returns empty when cache has no embeds", async () => {
			const mc = new MetadataCache();
			(mc.getCache as jest.Mock).mockReturnValue({});

			const { compiler } = makeCompiler({}, mc);
			const file = makeMockPublishFile();

			const assets = await compiler.extractBlobLinks(file);

			expect(assets).toHaveLength(0);
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
