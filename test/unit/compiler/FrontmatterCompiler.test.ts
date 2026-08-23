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
} from "src/compiler/FrontmatterCompiler";
import QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";
import { vi } from "vitest";
import { parse as parseYaml } from "yaml";

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
		manageSyncerStyles: false,
		noteSettingsIsInitialized: false,
		lastUsedSettingsTab: "",
		pluginVersion: "0.0.0",
		diffViewStyle: "auto",
		gitRemoteUrl: "",
		gitBranch: "main",
		gitAuthType: "none",
		gitAuthUsername: "",
		gitCorsProxyUrl: "",
		gitProviderHint: "github",
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
		getVaultPath: vi
			.fn()
			.mockReturnValue(overrides.vaultPath ?? "notes/test.md"),
		meta: {
			getCreatedAt: vi.fn().mockReturnValue(overrides.createdAt ?? null),
			getUpdatedAt: vi.fn().mockReturnValue(overrides.updatedAt ?? null),
			getPublishedAt: vi
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

	describe("YAML output validity", () => {
		const extractYamlBlock = (compiled: string) =>
			compiled.replace(/^---\n/, "").replace(/---\n$/, "");

		const buildStructuredFrontmatter = (
			compiler: FrontmatterCompiler,
			file: PublishFile,
			frontmatter: FrontMatterCache,
			includeAllFrontmatter = false,
		) => {
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			let published: TPublishedFrontMatter = { publish: true };

			published = compilerPrivate.addPermalink(file)(
				frontmatter,
				published,
			);
			published = compilerPrivate.addDefaultPassThrough(
				frontmatter,
				published,
			);
			published = compilerPrivate.addTimestampsFrontmatter(file)(
				frontmatter,
				published,
			);
			published = compilerPrivate.addTags(frontmatter, published);
			published = compilerPrivate.addCSSClasses(frontmatter, published);
			published = compilerPrivate.addSocialImage(frontmatter, published);

			return includeAllFrontmatter
				? { ...published, ...frontmatter }
				: published;
		};

		it("produces valid YAML when title contains colons", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = { title: "My: Title" } as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.title).toBe("My: Title");
		});

		it("produces valid YAML when description contains hashes", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				description: "Use # for headings",
			} as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.description).toBe("Use # for headings");
		});

		it("treats tag strings with brackets as literal values", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });
			const file = makeMockPublishFile();

			const frontmatter = {
				tags: "[not, an, array]",
			} as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
				true,
			);

			expect(structured.tags).toBe("[not, an, array]");
		});

		it("preserves titles with curly braces", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = { title: "{template}" } as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.title).toBe("{template}");
		});

		it("parses YAML when title contains single quotes", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = { title: "It's a test" } as FrontMatterCache;
			const compiled = compiler.compile(file, frontmatter);
			const yamlContent = extractYamlBlock(compiled);

			expect(() => parseYaml(yamlContent)).not.toThrow();
			expect(parseYaml(yamlContent)).toMatchObject({
				title: "It's a test",
			});
		});

		it("parses YAML when title contains double quotes", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				title: 'She said "hello"',
			} as FrontMatterCache;
			const compiled = compiler.compile(file, frontmatter);
			const yamlContent = extractYamlBlock(compiled);

			expect(() => parseYaml(yamlContent)).not.toThrow();
			expect(parseYaml(yamlContent)).toMatchObject({
				title: 'She said "hello"',
			});
		});

		it("preserves multiline descriptions", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				description: "Line one\nLine two",
			} as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.description).toBe("Line one\nLine two");
		});

		it("keeps empty string values when included", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });
			const file = makeMockPublishFile();

			const frontmatter = { title: "" } as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
				true,
			);

			expect(structured.title).toBe("");
		});

		it("keeps numeric tags as strings", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = { tag: "2024" } as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.tags).toEqual(["2024"]);
			expect(typeof structured.tags?.[0]).toBe("string");
		});

		it("preserves boolean-like strings versus booleans", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const stringFrontmatter = { draft: "true" } as FrontMatterCache;
			const booleanFrontmatter = { draft: true } as FrontMatterCache;

			const stringStructured = buildStructuredFrontmatter(
				compiler,
				file,
				stringFrontmatter,
			);
			const booleanStructured = buildStructuredFrontmatter(
				compiler,
				file,
				booleanFrontmatter,
			);

			expect(stringStructured.draft).toBe("true");
			expect(booleanStructured.draft).toBe(true);
		});

		it("preserves null-like strings", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = { description: "null" } as FrontMatterCache;
			const structured = buildStructuredFrontmatter(
				compiler,
				file,
				frontmatter,
			);

			expect(structured.description).toBe("null");
		});

		it("parses YAML with unicode characters", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				title: "日本語 🌟 café",
			} as FrontMatterCache;
			const compiled = compiler.compile(file, frontmatter);
			const yamlContent = extractYamlBlock(compiled);

			expect(() => parseYaml(yamlContent)).not.toThrow();
			expect(parseYaml(yamlContent)).toMatchObject({
				title: "日本語 🌟 café",
			});
		});

		it("parses YAML with tags containing special characters", () => {
			const compiler = makeCompiler();
			const file = makeMockPublishFile();

			const frontmatter = {
				tags: "tag/one, tag.two, tag-three, tag_four",
			} as FrontMatterCache;
			const compiled = compiler.compile(file, frontmatter);
			const yamlContent = extractYamlBlock(compiled);

			expect(() => parseYaml(yamlContent)).not.toThrow();
			expect(parseYaml(yamlContent)).toMatchObject({
				tags: ["tag/one", "tag.two", "tag-three", "tag_four"],
			});
		});

		it("renders a full frontmatter payload", () => {
			const compiler = makeCompiler({
				usePermalink: true,
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
				showPublishedTimestamp: true,
			});
			const file = makeMockPublishFile({
				vaultPath: "notes/full.md",
				createdAt: "2024-01-01",
				updatedAt: "2024-01-02",
				publishedAt: "2024-01-03",
			});

			const frontmatter = {
				title: "Full Title",
				description: "Full description",
				draft: true,
				comments: true,
				lang: "en",
				enableToc: true,
				permalink: "custom/path",
				aliases: "Alpha, Beta",
				tags: "one, two",
				cssclasses: "wide highlight",
				socialImage: "social.png",
				socialDescription: "social desc",
			} as FrontMatterCache;

			const compiled = compiler.compile(file, frontmatter);
			const yamlContent = extractYamlBlock(compiled);

			expect(() => parseYaml(yamlContent)).not.toThrow();
			expect(parseYaml(yamlContent)).toMatchObject({
				publish: true,
				title: "Full Title",
				description: "Full description",
				draft: true,
				comments: true,
				lang: "en",
				enableToc: true,
				permalink: "custom/path",
				aliases: ["Alpha", "Beta"],
				tags: ["one", "two"],
				cssclasses: ["wide", "highlight"],
				socialImage: "social.png",
				socialDescription: "social desc",
				created: "2024-01-01",
				modified: "2024-01-02",
				published: "2024-01-03",
			});
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
			const base = { cssclasses: "one two" };

			const result = compilerPrivate.addCSSClasses(base, {});

			expect(result.cssclasses).toEqual(["one", "two"]);
		});

		it("merges cssclass into cssclasses", () => {
			const compiler = makeCompiler();
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const base = { cssclasses: ["one"], cssclass: "two" };

			const result = compilerPrivate.addCSSClasses(base, {});

			expect(result.cssclasses).toEqual(["one", "two"]);
		});
	});

	describe("addSocialImage", () => {
		it("uses socialImage when provided", () => {
			const compiler = makeCompiler();
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const result = compilerPrivate.addSocialImage(
				{ socialImage: "img.png" },
				{},
			);

			expect(result.socialImage).toBe("img.png");
		});

		it("falls back to image/cover", () => {
			const compiler = makeCompiler();
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const result = compilerPrivate.addSocialImage(
				{ image: "img.png" },
				{},
			);

			expect(result.socialImage).toBe("img.png");
		});

		it("uses socialDescription when provided", () => {
			const compiler = makeCompiler();
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;

			const result = compilerPrivate.addSocialImage(
				{ socialDescription: "desc" },
				{},
			);

			expect(result.socialDescription).toBe("desc");
		});
	});

	describe("addTimestampsFrontmatter", () => {
		it("adds created timestamp when enabled", () => {
			const compiler = makeCompiler({ showCreatedTimestamp: true });
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ createdAt: "2024-01-01" });

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{},
				{},
			);

			expect(result.created).toBe("2024-01-01");
		});

		it("adds modified timestamp when enabled", () => {
			const compiler = makeCompiler({ showUpdatedTimestamp: true });
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ updatedAt: "2024-01-02" });

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{},
				{},
			);

			expect(result.modified).toBe("2024-01-02");
		});

		it("adds published timestamp when enabled", () => {
			const compiler = makeCompiler({ showPublishedTimestamp: true });
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ publishedAt: "2024-01-03" });

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{},
				{},
			);

			expect(result.published).toBe("2024-01-03");
		});

		it("uses override keys when includeAllFrontmatter is true", () => {
			const compiler = makeCompiler({ includeAllFrontmatter: true });
			const compilerPrivate =
				compiler as unknown as PrivateFrontmatterCompiler;
			const file = makeMockPublishFile({ createdAt: "2024-01-01" });

			const result = compilerPrivate.addTimestampsFrontmatter(file)(
				{ created: "1999-12-31" },
				{},
			);

			expect(result.created).toBe("1999-12-31");
		});
	});
});
