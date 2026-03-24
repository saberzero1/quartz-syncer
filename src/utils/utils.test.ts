import assert from "node:assert";
import {
	getSyncerPathForNote,
	getRewriteRules,
	wrapAround,
	generateUrlPath,
	generateBlobHash,
	sanitizePermalink,
	escapeRegExp,
} from "./utils";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";

describe("utils", () => {
	describe("getSyncerPathForNote", () => {
		const TESTS: Array<{
			name: string;
			input: { quartzPath: string; rule: PathRewriteRule };
			expected: string;
		}> = [
			{
				name: "replaces a path according to rules",
				input: {
					quartzPath: "defaultSyncerPath/content/note.md",
					rule: { from: "defaultSyncerPath", to: "quartzPath" },
				},
				expected: "quartzPath/content/note.md",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					getSyncerPathForNote(
						test.input.quartzPath,
						test.input.rule,
					),
					test.expected,
				);
			});
		}

		it("handles rewrites to base path correctly", () => {
			const rewriteRule: PathRewriteRule = {
				from: "defaultSyncerPath",
				to: "",
			};
			const quartzPath = "defaultSyncerPath/content/note.md";

			const result = getSyncerPathForNote(quartzPath, rewriteRule);

			expect(result).toBe("content/note.md");
		});
	});

	describe("getRewriteRules", () => {
		const TESTS: Array<{
			name: string;
			input: string;
			expected: PathRewriteRule;
		}> = [
			{
				name: "returns an empty array when no rules are provided",
				input: "",
				expected: { from: "", to: "/" },
			},
			{
				name: "parses a single rewrite rule",
				input: "defaultSyncerPath",
				expected: { from: "defaultSyncerPath", to: "/" },
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.deepStrictEqual(
					getRewriteRules(test.input),
					test.expected,
				);
			});
		}
	});

	describe("wrapAround", () => {
		it("wraps around a positive number", () => {
			assert.strictEqual(wrapAround(5, 2), 1);
		});

		it("returns 0 when value equals size", () => {
			expect(wrapAround(3, 3)).toBe(0);
		});

		it("wraps negative values into positive range", () => {
			expect(wrapAround(-1, 5)).toBe(4);
		});

		it("returns 0 for zero value", () => {
			expect(wrapAround(0, 3)).toBe(0);
		});
	});

	describe("generateUrlPath", () => {
		it("returns empty string for empty input", () => {
			expect(generateUrlPath("")).toBe("");
		});

		it("strips file extension and appends trailing slash", () => {
			expect(generateUrlPath("notes/my-note.md")).toBe("notes/my-note/");
		});

		it("slugifies path segments by default", () => {
			const result = generateUrlPath("My Folder/My Note.md");
			expect(result).toContain("/");
			expect(result.endsWith("/")).toBe(true);
			expect(result).not.toContain(" ");
		});

		it("preserves original path when slugifyPath is false", () => {
			expect(generateUrlPath("My Folder/My Note.md", false)).toBe(
				"My Folder/My Note/",
			);
		});

		it("handles paths without extensions", () => {
			expect(generateUrlPath("folder/readme", false)).toBe(
				"folder/readme/",
			);
		});

		it("handles deeply nested paths", () => {
			const result = generateUrlPath("a/b/c/d/note.md", false);
			expect(result).toBe("a/b/c/d/note/");
		});
	});

	describe("generateBlobHash", () => {
		it("returns a 40-character hex SHA1 hash", () => {
			const hash = generateBlobHash("hello world");
			expect(hash).toMatch(/^[0-9a-f]{40}$/);
		});

		it("returns consistent hash for same input", () => {
			const hash1 = generateBlobHash("test content");
			const hash2 = generateBlobHash("test content");
			expect(hash1).toBe(hash2);
		});

		it("returns different hashes for different input", () => {
			const hash1 = generateBlobHash("content A");
			const hash2 = generateBlobHash("content B");
			expect(hash1).not.toBe(hash2);
		});

		it("handles empty string", () => {
			const hash = generateBlobHash("");
			expect(hash).toMatch(/^[0-9a-f]{40}$/);
		});
	});

	describe("sanitizePermalink", () => {
		it("prepends / when missing", () => {
			expect(sanitizePermalink("my-page")).toBe("/my-page");
		});

		it("preserves existing leading /", () => {
			expect(sanitizePermalink("/my-page")).toBe("/my-page");
		});

		it("handles empty string by returning /", () => {
			expect(sanitizePermalink("")).toBe("/");
		});

		it("handles paths with multiple segments", () => {
			expect(sanitizePermalink("notes/sub/page")).toBe("/notes/sub/page");
		});
	});

	describe("escapeRegExp", () => {
		it("escapes dots", () => {
			expect(escapeRegExp("file.txt")).toBe("file\\.txt");
		});

		it("escapes brackets", () => {
			expect(escapeRegExp("[test]")).toBe("\\[test\\]");
		});

		it("escapes parentheses", () => {
			expect(escapeRegExp("(group)")).toBe("\\(group\\)");
		});

		it("escapes multiple special characters", () => {
			expect(escapeRegExp("a.b*c+d?e")).toBe("a\\.b\\*c\\+d\\?e");
		});

		it("leaves plain strings unchanged", () => {
			expect(escapeRegExp("hello world")).toBe("hello world");
		});

		it("escapes caret and dollar", () => {
			expect(escapeRegExp("^start$")).toBe("\\^start\\$");
		});

		it("produces a working regex pattern", () => {
			const escaped = escapeRegExp("file[0].txt");
			const regex = new RegExp(escaped);
			expect(regex.test("file[0].txt")).toBe(true);
			expect(regex.test("fileX0Ytxt")).toBe(false);
		});
	});

	describe("getSyncerPathForNote (additional)", () => {
		it("returns path unchanged when from does not match", () => {
			const rule: PathRewriteRule = {
				from: "other/path",
				to: "new/path",
			};

			expect(getSyncerPathForNote("notes/test.md", rule)).toBe(
				"notes/test.md",
			);
		});

		it("returns empty string for empty vault path", () => {
			const rule: PathRewriteRule = { from: "", to: "/" };
			expect(getSyncerPathForNote("", rule)).toBe("");
		});
	});
});
