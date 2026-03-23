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
	EXCALIDRAW_REGEX,
	TRANSCLUDED_SVG_REGEX,
	DATAVIEW_LINK_TARGET_BLANK_REGEX,
	DATAVIEW_FIELD_REGEX,
	DATAVIEW_INLINE_FIELD_REGEX,
	TRANSCLUDED_FILE_REGEX,
	FILE_REGEX,
} from "./regexes";

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

		it("matches markdown image with path ![](folder/img.png)", () => {
			const matches = allMatches(FILE_REGEX, "![](some/path/photo.png)");
			expect(matches).toHaveLength(1);
		});

		it("matches all supported extensions", () => {
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

		it("matches markdown image with URL-encoded path", () => {
			const matches = allMatches(
				FILE_REGEX,
				"![](some%20path/photo.png)",
			);
			expect(matches).toHaveLength(1);
		});

		it("does not match regular markdown links [text](url)", () => {
			const matches = allMatches(
				FILE_REGEX,
				"[click here](https://example.com)",
			);
			expect(matches).toHaveLength(0);
		});

		it("does not match unsupported extensions", () => {
			const matches = allMatches(FILE_REGEX, "![](file.txt)");
			expect(matches).toHaveLength(0);
		});

		it("matches multiple markdown images in one text", () => {
			const text = `![](a.png) text ![alt](b.jpg) more ![](c.webp#right)`;
			const matches = allMatches(FILE_REGEX, text);
			expect(matches).toHaveLength(3);
		});
	});

	describe("TRANSCLUDED_SVG_REGEX", () => {
		it("matches ![[file.svg]]", () => {
			const matches = allMatches(
				TRANSCLUDED_SVG_REGEX,
				"![[diagram.svg]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches ![[file.svg|size]]", () => {
			const matches = allMatches(
				TRANSCLUDED_SVG_REGEX,
				"![[diagram.svg|400]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("does not match non-SVG files", () => {
			const matches = allMatches(TRANSCLUDED_SVG_REGEX, "![[photo.png]]");
			expect(matches).toHaveLength(0);
		});
	});

	describe("BLOCKREF_REGEX", () => {
		it("matches block references ^blockid", () => {
			const matches = allMatches(BLOCKREF_REGEX, "Some text ^myblock\n");
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toContain("^myblock");
		});

		it("matches block references at end of file (no trailing newline)", () => {
			const matches = allMatches(BLOCKREF_REGEX, "Some text ^myblock");
			expect(matches).toHaveLength(1);
		});

		it("does not match caret in middle of text", () => {
			const matches = allMatches(BLOCKREF_REGEX, "2^10 is 1024");
			expect(matches).toHaveLength(0);
		});
	});

	describe("CODE_FENCE_REGEX", () => {
		it("matches inline code `code`", () => {
			const matches = allMatches(
				CODE_FENCE_REGEX,
				"Some `inline code` here",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("inline code");
		});

		it("matches multiple inline code spans", () => {
			const matches = allMatches(CODE_FENCE_REGEX, "`a` and `b` and `c`");
			expect(matches).toHaveLength(3);
		});
	});

	describe("CODEBLOCK_REGEX", () => {
		it("matches fenced code blocks", () => {
			const text = "```js\nconsole.log('hi');\n```";
			const matches = allMatches(CODEBLOCK_REGEX, text);
			expect(matches).toHaveLength(1);
		});

		it("matches code blocks without language", () => {
			const text = "```\nsome code\n```";
			const matches = allMatches(CODEBLOCK_REGEX, text);
			expect(matches).toHaveLength(1);
		});

		it("does not match unclosed code blocks", () => {
			const text = "```\nsome code without closing";
			const matches = allMatches(CODEBLOCK_REGEX, text);
			expect(matches).toHaveLength(0);
		});
	});

	describe("DATAVIEW_FIELD_REGEX", () => {
		it("matches dataview field key:: value", () => {
			const matches = allMatches(DATAVIEW_FIELD_REGEX, "rating:: 5\n");
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("rating");
			expect(matches[0][2]).toBe("5");
		});

		it("matches fields with complex values", () => {
			const matches = allMatches(
				DATAVIEW_FIELD_REGEX,
				"due:: 2024-01-15\n",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][2]).toBe("2024-01-15");
		});
	});

	describe("DATAVIEW_INLINE_FIELD_REGEX", () => {
		it("matches [key:: value] syntax", () => {
			const matches = allMatches(
				DATAVIEW_INLINE_FIELD_REGEX,
				"[rating:: 5]",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("rating");
			expect(matches[0][2]).toBe("5");
		});

		it("matches (key:: value) syntax", () => {
			const matches = allMatches(
				DATAVIEW_INLINE_FIELD_REGEX,
				"(rating:: 5)",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][3]).toBe("rating");
			expect(matches[0][4]).toBe("5");
		});
	});

	describe("DATAVIEW_LINK_TARGET_BLANK_REGEX", () => {
		it('matches target="_blank" with double quotes', () => {
			const matches = allMatches(
				DATAVIEW_LINK_TARGET_BLANK_REGEX,
				'target="_blank" rel="noopener"',
			);
			expect(matches).toHaveLength(1);
		});

		it("matches target='_blank' with single quotes", () => {
			const matches = allMatches(
				DATAVIEW_LINK_TARGET_BLANK_REGEX,
				"target='_blank' rel='noopener'",
			);
			expect(matches).toHaveLength(1);
		});
	});

	describe("EXCALIDRAW_REGEX", () => {
		it("matches excalidraw coordinate patterns", () => {
			const text = ":[[100,200],some data]]";
			const matches = allMatches(EXCALIDRAW_REGEX, text);
			expect(matches).toHaveLength(1);
		});
	});

	describe("FRONTMATTER_REGEX (additional)", () => {
		it("does not match frontmatter with CRLF line endings (regex requires LF)", () => {
			const text = "---\r\ntitle: Test\r\n---\r\n\r\nBody";
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(0);
		});

		it("captures multiline frontmatter content", () => {
			const text = `---\ntitle: Test\ntags:\n  - a\n  - b\n---\n\nBody`;
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toContain("tags:");
		});

		it("does not match when --- appears mid-document without leading position", () => {
			const text = "Some text\n---\ntitle: Nope\n---\n";
			const matches = allMatches(FRONTMATTER_REGEX, text);
			expect(matches).toHaveLength(0);
		});
	});

	describe("FILE_REGEX (additional)", () => {
		it("captures alt text in group 1", () => {
			const matches = allMatches(FILE_REGEX, "![my alt](photo.png)");
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("my alt");
		});

		it("captures path without extension in group 2", () => {
			const matches = allMatches(FILE_REGEX, "![](folder/photo.png)");
			expect(matches).toHaveLength(1);
			expect(matches[0][2]).toBe("folder/photo");
		});

		it("captures extension with dot in group 3", () => {
			const matches = allMatches(FILE_REGEX, "![](photo.jpg)");
			expect(matches).toHaveLength(1);
			expect(matches[0][3]).toBe(".jpg");
		});

		it("matches image with anchor and captures path before anchor", () => {
			const matches = allMatches(FILE_REGEX, "![](photo.png#center)");
			expect(matches).toHaveLength(1);
			expect(matches[0][2]).toBe("photo");
			expect(matches[0][3]).toBe(".png");
		});

		it("matches http URLs (filtering is done in compiler, not regex)", () => {
			const matches = allMatches(
				FILE_REGEX,
				"![alt](https://example.com/photo.png)",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches URL-encoded filenames with spaces", () => {
			const matches = allMatches(
				FILE_REGEX,
				"![](my%20folder/my%20photo.png)",
			);
			expect(matches).toHaveLength(1);
		});
	});

	describe("TRANSCLUDED_FILE_REGEX (additional)", () => {
		it("captures filename without extension in group 1 (with display name)", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[photo.png|alt text]]",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("photo");
			expect(matches[0][4]).toBe("alt text");
		});

		it("captures filename without extension in group 5 (no display name)", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[photo.png]]",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][5]).toBe("photo");
		});

		it("does not match across ]] boundaries", () => {
			const text = "![[note]] some text ![[photo.png]]";
			const matches = allMatches(TRANSCLUDED_FILE_REGEX, text);
			expect(matches).toHaveLength(1);
			expect(matches[0][0]).toBe("![[photo.png]]");
		});

		it("matches file with URL-encoded name", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[my%20photo.png]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches file with spaces in path", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[my folder/my photo.png]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("matches anchor with page reference ![[doc.pdf#page=5|alt]]", () => {
			const matches = allMatches(
				TRANSCLUDED_FILE_REGEX,
				"![[doc.pdf#page=5|My PDF]]",
			);
			expect(matches).toHaveLength(1);
			expect(matches[0][4]).toBe("My PDF");
		});
	});

	describe("BLOCKREF_REGEX (additional)", () => {
		it("captures the full block ref including caret", () => {
			const matches = allMatches(BLOCKREF_REGEX, "Some text ^abc123\n");
			expect(matches).toHaveLength(1);
			expect(matches[0][1]).toBe("^abc123\n");
		});

		it("matches multiple block refs in multiline text", () => {
			const text = "Line one ^ref1\nLine two ^ref2\n";
			const matches = allMatches(BLOCKREF_REGEX, text);
			expect(matches).toHaveLength(2);
		});
	});

	describe("CODEBLOCK_REGEX (additional)", () => {
		it("matches multiple code blocks in one text", () => {
			const text = "```js\ncode1\n```\n\nText\n\n```python\ncode2\n```";
			const matches = allMatches(CODEBLOCK_REGEX, text);
			expect(matches).toHaveLength(2);
		});

		it("matches code block with empty content", () => {
			const text = "```\n\n```";
			const matches = allMatches(CODEBLOCK_REGEX, text);
			expect(matches).toHaveLength(1);
		});
	});

	describe("TRANSCLUDED_SVG_REGEX (additional)", () => {
		it("matches SVG with path ![[folder/diagram.svg]]", () => {
			const matches = allMatches(
				TRANSCLUDED_SVG_REGEX,
				"![[assets/diagram.svg]]",
			);
			expect(matches).toHaveLength(1);
		});

		it("does not match SVG without transclusion prefix", () => {
			const matches = allMatches(
				TRANSCLUDED_SVG_REGEX,
				"[[diagram.svg]]",
			);
			expect(matches).toHaveLength(0);
		});
	});
});
