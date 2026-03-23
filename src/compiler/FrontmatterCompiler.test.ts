/**
 * Layer 2: FrontmatterCompiler unit tests.
 *
 * Tests the frontmatter compilation pipeline in isolation.
 * These behavioral contracts must hold during the remark-obsidian migration.
 */

import { FrontMatterCache } from "obsidian";
import {
	FrontmatterCompiler,
	TFrontmatter,
	TPublishedFrontMatter,
} from "./FrontmatterCompiler";
import QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";

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

function makeCompiler(settingsOverrides: Partial<QuartzSyncerSettings> = {}) {
	return new FrontmatterCompiler(makeSettings(settingsOverrides));
}

type PrivateFrontmatterCompiler = {
	addPermalink: (
		file: PublishFile,
	) => (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
	addDefaultPassThrough: (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
	addTags: (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
	addCSSClasses: (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
	addSocialImage: (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
	addTimestampsFrontmatter: (
		file: PublishFile,
	) => (
		base: TFrontmatter,
		next: TPublishedFrontMatter,
	) => TPublishedFrontMatter;
};

function makeMockPublishFile(
	overrides: Partial<{
		vaultPath: string;
		createdAt: string | null;
		updatedAt: string | null;
		publishedAt: string | null;
	}> = {},
) {
	return {
		getVaultPath: jest
			.fn()
			.mockReturnValue(overrides.vaultPath ?? "notes/test.md"),
		meta: {
			getCreatedAt: jest
				.fn()
				.mockReturnValue(overrides.createdAt ?? null),
			getUpdatedAt: jest
				.fn()
				.mockReturnValue(overrides.updatedAt ?? null),
			getPublishedAt: jest
				.fn()
				.mockReturnValue(overrides.publishedAt ?? null),
		},
	} as unknown as PublishFile;
}

describe("FrontmatterCompiler", () => {
	describe("compile", () => {
		it("renders YAML frontmatter with publish flag", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();
			const result = compiler.compile(file, {} as FrontMatterCache);

			expect(result.startsWith("---\n")).toBe(true);
			expect(result.endsWith("---\n")).toBe(true);
			expect(result).toContain("publish: true");
		});

		it("renders JSON frontmatter when configured", () => {
			const compiler = makeCompiler({ frontmatterFormat: "json" });
			const file = makeMockPublishFile();
			const result = compiler.compile(file, {} as FrontMatterCache);

			expect(result).toBe('---\n{"publish":true}\n---\n');
		});

		it("strips position key from frontmatter", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				title: "Hello",
				position: { start: { line: 1 } },
			} as FrontMatterCache;
			const result = compiler.compile(file, frontmatter);

			expect(result).toContain("title: Hello");
			expect(result).not.toContain("position");
		});

		it("merges all original frontmatter when includeAllFrontmatter is true", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });
			const file = makeMockPublishFile();

			const frontmatter = {
				custom: "value",
				count: 2,
			} as FrontMatterCache;
			const result = compiler.compile(file, frontmatter);

			expect(result).toContain("custom: value");
			expect(result).toContain("count: 2");
		});

		it("keeps original publish value when included", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });
			const file = makeMockPublishFile();

			const frontmatter = {
				publish: false,
			} as FrontMatterCache;
			const result = compiler.compile(file, frontmatter);

			expect(result).toContain("publish: false");
		});
	});

	describe("addPermalink", () => {
		it("passes through permalink from frontmatter", () => {
			const compiler = makeCompiler({ usePermalink: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ vaultPath: "notes/test.md" });
			const base = { permalink: "custom/path" };

			const result = compilerPrivate.addPermalink(file)(base, {});

			expect(result.permalink).toBe("custom/path");
		});

		it("uses sanitized vault path when usePermalink is true", () => {
			const compiler = makeCompiler({ usePermalink: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ vaultPath: "notes/test.md" });

			const result = compilerPrivate.addPermalink(file)({}, {});

			expect(result.permalink).toBe("/notes/test.md");
		});

		it("does not add permalink when usePermalink is false", () => {
			const compiler = makeCompiler({ usePermalink: false });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile();

			const result = compilerPrivate.addPermalink(file)({}, {});

			expect(result.permalink).toBeUndefined();
		});

		it("combines aliases and alias strings", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile();

			const base = {
				aliases: "One, Two",
				alias: "Two, Three",
			};

			const result = compilerPrivate.addPermalink(file)(base, {});

			expect(result.aliases).toEqual(["One", "Two", "Three"]);
		});

		it("combines aliases and alias arrays", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile();

			const base = {
				aliases: ["Alpha", "Beta"],
				alias: ["Beta", "Gamma"],
			};

			const result = compilerPrivate.addPermalink(file)(base, {});

			expect(result.aliases).toEqual(["Alpha", "Beta", "Gamma"]);
		});

		it("splits alias strings and filters empty entries", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile();
			const base = { alias: "First, , Second" };

			const result = compilerPrivate.addPermalink(file)(base, {});

			expect(result.aliases).toEqual(["First", "Second"]);
		});

		it("omits aliases when no valid values exist", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile();
			const base = { alias: "" };

			const result = compilerPrivate.addPermalink(file)(base, {});

			expect(result.aliases).toBeUndefined();
		});
	});

	describe("addDefaultPassThrough", () => {
		it("passes through standard fields", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const base = {
				title: "Title",
				description: "Desc",
				draft: true,
				comments: true,
				lang: "fr",
				enableToc: true,
			};

			const result = compilerPrivate.addDefaultPassThrough(base, {});

			expect(result).toMatchObject({
				title: "Title",
				description: "Desc",
				draft: true,
				comments: true,
				lang: "fr",
				enableToc: true,
			});
		});

		it("skips falsy default pass-through values", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const base = {
				title: "",
				description: "",
				draft: false,
				comments: false,
				lang: "",
				enableToc: false,
			};

			const result = compilerPrivate.addDefaultPassThrough(base, {});

			expect(result).toEqual({});
		});
	});

	describe("addTags", () => {
		it("splits comma-delimited tags string", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { tags: "one, two, three" };

			const result = compilerPrivate.addTags(base, {});

			expect(result.tags).toEqual(["one", "two", "three"]);
		});

		it("passes through tags array", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { tags: ["a", "b"] };

			const result = compilerPrivate.addTags(base, {});

			expect(result.tags).toEqual(["a", "b"]);
		});

		it("merges tag string into tags", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { tags: ["a"], tag: "b, c" };

			const result = compilerPrivate.addTags(base, {});

			expect(result.tags).toEqual(["a", "b", "c"]);
		});

		it("merges tag array into tags", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { tags: ["a"], tag: ["b", "c"] };

			const result = compilerPrivate.addTags(base, {});

			expect(result.tags).toEqual(["a", "b", "c"]);
		});

		it("deduplicates tags from tag and tags", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { tags: ["a", "b"], tag: "b, c" };

			const result = compilerPrivate.addTags(base, {});

			expect(result.tags).toEqual(["a", "b", "c"]);
		});

		it("omits tags when no values are provided", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const result = compilerPrivate.addTags({}, {});

			expect(result.tags).toBeUndefined();
		});
	});

	describe("addCSSClasses", () => {
		it("splits cssclasses string by whitespace", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { cssclasses: "alpha beta" };

			const result = compilerPrivate.addCSSClasses(base, {});

			expect(result.cssclasses).toEqual(["alpha", "beta"]);
		});

		it("splits cssclass string by whitespace", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { cssclass: "one two" };

			const result = compilerPrivate.addCSSClasses(base, {});

			expect(result.cssclasses).toEqual(["one", "two"]);
		});

		it("merges cssclasses arrays with deduplication", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { cssclasses: ["a", "b"], cssclass: ["b", "c"] };

			const result = compilerPrivate.addCSSClasses(base, {});

			expect(result.cssclasses).toEqual(["a", "b", "c"]);
		});
	});

	describe("addSocialImage", () => {
		it("prefers socialImage over image and cover", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const base = {
				socialImage: "social.png",
				image: "image.png",
				cover: "cover.png",
			};

			const result = compilerPrivate.addSocialImage(base, {});

			expect(result.socialImage).toBe("social.png");
		});

		it("falls back to image when socialImage is absent", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { image: "image.png", cover: "cover.png" };

			const result = compilerPrivate.addSocialImage(base, {});

			expect(result.socialImage).toBe("image.png");
		});

		it("falls back to cover when only cover is provided", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { cover: "cover.png" };

			const result = compilerPrivate.addSocialImage(base, {});

			expect(result.socialImage).toBe("cover.png");
		});

		it("skips empty socialImage and socialDescription", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { socialImage: "", socialDescription: "" };

			const result = compilerPrivate.addSocialImage(base, {});

			expect(result.socialImage).toBeUndefined();
			expect(result.socialDescription).toBeUndefined();
		});

		it("passes through socialDescription", () => {
			const compiler = makeCompiler();

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { socialDescription: "hello" };

			const result = compilerPrivate.addSocialImage(base, {});

			expect(result.socialDescription).toBe("hello");
		});
	});

	describe("addTimestampsFrontmatter", () => {
		it("adds created/modified/published when enabled", () => {
			const compiler = makeCompiler({
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
				showPublishedTimestamp: true,
			});

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const file = makeMockPublishFile({
				createdAt: "2024-01-01",
				updatedAt: "2024-01-02",
				publishedAt: "2024-01-03",
			});

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{},
				{},
			);

			expect(result).toMatchObject({
				created: "2024-01-01",
				modified: "2024-01-02",
				published: "2024-01-03",
			});
		});

		it("uses created/date fallback when includeAllFrontmatter is true", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ createdAt: "2024-01-01" });
			const base = { created: "2020-01-01", date: "2020-02-02" };

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				base,
				{},
			);

			expect(result.created).toBe("2020-01-01");
		});

		it("uses modified fallback chain when includeAllFrontmatter is true", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ updatedAt: "2024-01-02" });

			const base = {
				updated: "2023-01-01",
				"last-modified": "2022-01-01",
			};

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				base,
				{},
			);

			expect(result.modified).toBe("2023-01-01");
		});

		it("uses published fallback chain when includeAllFrontmatter is true", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ publishedAt: "2024-01-03" });

			const base = {
				publishDate: "2023-05-05",
				date: "2023-04-04",
			};

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				base,
				{},
			);

			expect(result.published).toBe("2023-05-05");
		});

		it("skips timestamps when meta values are missing", () => {
			const compiler = makeCompiler({ showCreatedTimestamp: true });

			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ createdAt: null });

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{},
				{},
			);

			expect(result.created).toBeUndefined();
		});
	});
});
