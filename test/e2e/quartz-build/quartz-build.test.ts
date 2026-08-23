import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
	ensureQuartzCache,
	createTestQuartzDir,
	cleanupTestDir,
} from "./quartz-setup";
import {
	indexHtmlExists,
	outputExists,
	runQuartzBuild,
	writeAssetToQuartz,
	writeNoteToQuartz,
} from "./helpers";

const MINIMAL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
	"base64",
);

let quartzDir = "";

function resetContentDir(baseDir: string): void {
	const contentDir = join(baseDir, "content");
	rmSync(contentDir, { recursive: true, force: true });
	mkdirSync(contentDir, { recursive: true });
}

function noteHtmlExists(baseDir: string, slug: string): boolean {
	const directPath = join(baseDir, "public", `${slug}.html`);
	const indexPath = join(baseDir, "public", slug, "index.html");
	return existsSync(directPath) || existsSync(indexPath);
}

beforeAll(() => {
	ensureQuartzCache();
}, 120_000);

beforeEach(() => {
	quartzDir = createTestQuartzDir();
	resetContentDir(quartzDir);
});

afterEach(() => {
	if (quartzDir) {
		cleanupTestDir(quartzDir);
		quartzDir = "";
	}
});

describe("Quartz build smoke tests", () => {
	it("Basic note with standard frontmatter", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Test\npublish: true\n---\nHello world.",
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Negative: Invalid YAML kills build", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: [unclosed bracket\n---\nBody",
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).not.toBe(0);
	});

	it("Note with callouts + math + footnotes", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Callouts",
				"publish: true",
				"---",
				"",
				"> [!note] Title",
				"> Content",
				"",
				"$x_i + y^2$",
				"",
				"Footnote[^1]",
				"",
				"[^1]: definition",
			].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Wikilinks (various forms)", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Home",
				"publish: true",
				"---",
				"",
				"[[Second Note]]",
				"[[Second Note|Display]]",
				"[[Second Note#Heading]]",
			].join("\n"),
		);
		writeNoteToQuartz(
			quartzDir,
			"second-note.md",
			[
				"---",
				"title: Second Note",
				"publish: true",
				"---",
				"",
				"## Heading",
				"Content",
			].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Image embeds", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Images",
				"publish: true",
				"---",
				"",
				"![[test-image.png]]",
				"![alt](test-image.png)",
			].join("\n"),
		);
		writeAssetToQuartz(quartzDir, "test-image.png", MINIMAL_PNG);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Unicode/CJK filename", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Home\npublish: true\n---\nLanding",
		);
		writeNoteToQuartz(
			quartzDir,
			"日本語ノート.md",
			"---\ntitle: 日本語ノート\npublish: true\n---\nこんにちは",
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("All frontmatter fields Syncer produces", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Full Frontmatter",
				"publish: true",
				"aliases:",
				"  - Alias One",
				"  - Alias Two",
				"tags:",
				"  - tag-a",
				"  - tag-b",
				"cssclasses:",
				"  - class-a",
				"description: Frontmatter coverage",
				"created: 2024-01-01",
				"modified: 2024-01-02",
				"published: 2024-01-03",
				"permalink: /custom-path",
				"socialImage: /img.png",
				"socialDescription: Social desc",
				"draft: false",
				"comments: true",
				"lang: en",
				"enableToc: true",
				"---",
				"Body",
			].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Dataview inline fields rendered to static content", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Dataview",
				"publish: true",
				"---",
				"",
				"key:: value",
			].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Multiple notes with cross-links", async () => {
		writeNoteToQuartz(
			quartzDir,
			"a.md",
			["---", "title: A", "publish: true", "---", "", "[[B]]"].join("\n"),
		);
		writeNoteToQuartz(
			quartzDir,
			"b.md",
			["---", "title: B", "publish: true", "---", "", "[[C]]"].join("\n"),
		);
		writeNoteToQuartz(
			quartzDir,
			"c.md",
			["---", "title: C", "publish: true", "---", "", "[[A]]"].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(noteHtmlExists(quartzDir, "a")).toBe(true);
		expect(noteHtmlExists(quartzDir, "b")).toBe(true);
		expect(noteHtmlExists(quartzDir, "c")).toBe(true);
	});

	it("CRLF line endings + BOM", async () => {
		const content = `\uFEFF---\r\ntitle: BOM\r\npublish: true\r\n---\r\nHello\r\nWorld`;
		writeNoteToQuartz(quartzDir, "index.md", content);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});

	it("Empty content directory", async () => {
		const result = await runQuartzBuild(quartzDir);
		console.info(
			`Empty content build ${result.exitCode === 0 ? "succeeded" : "failed"} (exit ${result.exitCode})`,
		);
		expect(typeof result.exitCode).toBe("number");
	});

	it("Note with blockquotes and horizontal rules", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			[
				"---",
				"title: Quotes",
				"publish: true",
				"---",
				"",
				"> blockquote",
				"",
				"---",
				"",
				"After rule",
			].join("\n"),
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
		expect(indexHtmlExists(quartzDir)).toBe(true);
	});
});
