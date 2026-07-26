/**
 * Layer 1: Pure regex contract tests.
 *
 * These tests define the behavioral contract for each regex pattern.
 * During migration to remark-obsidian, the regex implementation will be swapped
 * but these tests must continue to pass — verifying parity.
 *
 * Each test group documents: what matches, what doesn't match, and what capture groups contain.
 */

import {
	FRONTMATTER_REGEX,
	BLOCKREF_REGEX,
	CODE_FENCE_REGEX,
	CODEBLOCK_REGEX,
	TRANSCLUDED_SVG_REGEX,
	DATAVIEW_LINK_TARGET_BLANK_REGEX,
	DATAVIEW_FIELD_REGEX,
	DATAVIEW_INLINE_FIELD_REGEX,
	TRANSCLUDED_FILE_REGEX,
	FILE_REGEX,
} from "src/utils/regexes";

/** Helper: reset lastIndex on global regexes before each use */
function resetRegex(regex: RegExp): RegExp {
	regex.lastIndex = 0;

	return regex;
}

/** Collects all matches from a global regex, resetting lastIndex first to avoid stale state */
function allMatches(regex: RegExp, text: string): RegExpExecArray[] {
	resetRegex(regex);
	const results: RegExpExecArray[] = [];
	let execResult = regex.exec(text);

	while (execResult !== null) {
		results.push(execResult);
		execResult = regex.exec(text);
	}

	return results;
}

describe("regexes", () => {
	describe("FRONTMATTER_REGEX", () => {
		it("matches standard YAML frontmatter", () => {
			const text = `---\ntitle: Hello\ntags: [a, b]\n---\n\nBody text`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toContain("title: Hello");
		});

		it("matches frontmatter with leading whitespace", () => {
			const text = `  ---\ntitle: Test\n---\n\nBody`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
		});

		it("does not match --- in body text", () => {
			const text = `---\ntitle: Test\n---\n\nSome text\n---\nMore text`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
		});

		it("matches frontmatter with empty content", () => {
			const text = `---\n\n---\n\nBody`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
		});

		it("matches frontmatter containing wikilinks (the bug scenario)", () => {
			const text = `---\nrelated: "[[Some Note|Display]]"\n---\n\nBody with [[link]]`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toContain("[[Some Note|Display]]");
		});
	});

	describe("TRANSCLUDED_FILE_REGEX", () => {
		it("matches basic transcluded image ![[img.png]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[photo.png]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches transcluded image with display name ![[img.png|alt]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[photo.png|my alt text]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches transcluded image with size ![[img.png|400]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[photo.png|400]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches transcluded image with anchor ![[img.webp#right]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[goliath.webp#right]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches transcluded image with anchor and size ![[img.webp#right|400]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[goliath.webp#right|400]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches all supported image extensions", () => {
			const extensions = [
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"mp4",
				"mkv",
				"mov",
				"avi",
				"mp3",
				"wav",
				"ogg",
				"pdf",
			];

			for (const ext of extensions) {
				const matches = allMatches(
					TRANSCLUDED_FILE_REGEX,
					`![[file.${ext}]]`,
				);
				expect(matches).toHaveLength(1);
			}
		});

		it("matches transcluded image with path ![[folder/img.png]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[some/path/to/photo.png]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches transcluded PDF with page anchor ![[doc.pdf#page=3]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[document.pdf#page=3]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("does not match regular wikilinks [[note]]", () => {
			const matches = allMatches(TRANSCLUDED_FILE_REGEX, "[[some note]]");
			expect(matches).toHaveLength(0);
		});

		it("does not match non-transcluded image links [[img.png]]", () => {
			const matches = allMatches(TRANSCLUDED_FILE_REGEX, "[[photo.png]]");
			expect(matches).toHaveLength(0);
		});

		it("does not match unsupported extensions", () => {
			const matches = allMatches(TRANSCLUDED_FILE_REGEX, "![[file.txt]]");
			expect(matches).toHaveLength(0);
		});

		it("matches multiple transcluded files in one text", () => {
			const text = `Some text ![[a.png]] and ![[b.jpg|200]] and ![[c.webp#right]]`;
			const matches = allMatches(TRANSCLUDED_FILE_REGEX, text);
			expect(matches).toHaveLength(3);
		});
	});

	describe("FILE_REGEX", () => {
		it("matches basic markdown image ![](img.png)", () => {
			const matches = allMatches(FILE_REGEX, "![](photo.png)");
			expect(matches).toHaveLength(1);
		});

		it("matches markdown image with alt text ![alt](img.png)", () => {
			const matches = allMatches(FILE_REGEX, "![my alt text](photo.png)");
			expect(matches).toHaveLength(1);
		});

		it("matches markdown image with anchor ![](img.webp#right)", () => {
			const matches = allMatches(FILE_REGEX, "![](goliath.webp#right)");
			expect(matches).toHaveLength(1);
		});

		it("matches markdown image with anchor and title", () => {
			const matches = allMatches(
				FILE_REGEX,
				'![alt](goliath.webp#right "title")',
			);
			expect(matches).toHaveLength(1);
		});

		it("matches all supported file extensions", () => {
			const extensions = [
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"mp4",
				"mkv",
				"mov",
				"avi",
				"mp3",
				"wav",
				"ogg",
				"pdf",
			];

			for (const ext of extensions) {
				const matches = allMatches(FILE_REGEX, `![](file.${ext})`);
				expect(matches).toHaveLength(1);
			}
		});

		it("matches markdown image with path ![](folder/img.png)", () => {
			const matches = allMatches(
				FILE_REGEX,
				"![](some/path/to/photo.png)",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches markdown PDF with page anchor ![](doc.pdf#page=3)", () => {
			const matches = allMatches(FILE_REGEX, "![](document.pdf#page=3)");
			expect(matches).toHaveLength(1);
		});

		it("does not match regular links [text](url)", () => {
			const matches = allMatches(
				FILE_REGEX,
				"[link](http://example.com)",
			);
			expect(matches).toHaveLength(0);
		});
	});

	describe("DATAVIEW_LINK_TARGET_BLANK_REGEX", () => {
		it("matches target blank with rel noopener", () => {
			const matches = allMatches(
				DATAVIEW_LINK_TARGET_BLANK_REGEX,
				'target="_blank" rel="noopener"',
			);
			expect(matches).toHaveLength(1);
		});
	});

	describe("DATAVIEW_FIELD_REGEX", () => {
		it("matches dataview field syntax", () => {
			const matches = allMatches(DATAVIEW_FIELD_REGEX, "field:: value");
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("field");
			expect(matches[0][2]).toBe("value");
		});
	});

	describe("DATAVIEW_INLINE_FIELD_REGEX", () => {
		it("matches inline field in brackets", () => {
			const matches = allMatches(
				DATAVIEW_INLINE_FIELD_REGEX,
				"[field:: value]",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("field");
			expect(matches[0][2]).toBe("value");
		});

		it("matches inline field in parentheses", () => {
			const matches = allMatches(
				DATAVIEW_INLINE_FIELD_REGEX,
				"(field:: value)",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][3]).toBe("field");
			expect(matches[0][4]).toBe("value");
		});
	});

	describe("TRANSCLUDED_SVG_REGEX", () => {
		it("matches transcluded svg with alias", () => {
			const matches = allMatches(
				TRANSCLUDED_SVG_REGEX,
				"![[icon.svg|alt]]",
			);
			expect(matches).toHaveLength(1);
		});
	});

	describe("BLOCKREF_REGEX", () => {
		it("matches block references", () => {
			const matches = allMatches(
				BLOCKREF_REGEX,
				"This is a block ^abc123",
			);
			expect(matches).toHaveLength(1);
		});
	});

	describe("CODE_FENCE_REGEX", () => {
		it("matches inline code", () => {
			const matches = allMatches(CODE_FENCE_REGEX, "Use `code` here");
			expect(matches).toHaveLength(1);
		});
	});

	describe("CODEBLOCK_REGEX", () => {
		it("matches fenced code blocks", () => {
			const matches = allMatches(CODEBLOCK_REGEX, "```\ncode here\n```");
			expect(matches).toHaveLength(1);
		});
	});
});
