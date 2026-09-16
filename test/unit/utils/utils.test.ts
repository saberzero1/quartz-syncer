import assert from "node:assert";
import {
	getSyncerPathForNote,
	getRewriteRules,
	wrapAround,
	generateUrlPath,
	generateBlobHash,
	sanitizePermalink,
	escapeRegExp,
	cleanQueryResult,
	isWithinVaultPath,
	normalizeVaultPath,
	type PathRewriteRule,
} from "src/utils/utils";

describe("utils", () => {
	describe("isWithinVaultPath", () => {
		for (const vaultPath of ["/", "", "."]) {
			it(`treats ${JSON.stringify(vaultPath)} as the whole vault`, () => {
				expect(isWithinVaultPath("a.md", vaultPath)).toBe(true);
				expect(isWithinVaultPath("notes/nested/a.md", vaultPath)).toBe(
					true,
				);
			});
		}

		it("accepts a trailing slash on the configured folder", () => {
			expect(isWithinVaultPath("notes/a.md", "notes/")).toBe(true);
			expect(isWithinVaultPath("notes", "notes/")).toBe(true);
			expect(isWithinVaultPath("notes-old/a.md", "notes/")).toBe(false);
		});

		it("includes an exact folder match", () => {
			expect(isWithinVaultPath("notes", "notes")).toBe(true);
		});

		it("matches folder boundaries rather than shared prefixes", () => {
			expect(isWithinVaultPath("notes/a.md", "notes")).toBe(true);
			expect(isWithinVaultPath("notes-old/a.md", "notes")).toBe(false);
			expect(isWithinVaultPath("notes.md", "notes")).toBe(false);
		});

		it("normalises leading slashes on both sides", () => {
			expect(isWithinVaultPath("/vault/notes/a.md", "/vault")).toBe(true);
			expect(isWithinVaultPath("vault/notes/a.md", "/vault")).toBe(true);
			expect(isWithinVaultPath("/vault/notes/a.md", "vault")).toBe(true);
			expect(isWithinVaultPath("/vault-old/a.md", "/vault")).toBe(false);
		});

		it("includes nested paths only within the configured subtree", () => {
			expect(isWithinVaultPath("notes/nested/deep/a.md", "notes")).toBe(
				true,
			);
			expect(isWithinVaultPath("notes/nested/a.md", "notes/nested")).toBe(
				true,
			);
			expect(
				isWithinVaultPath("notes/nested-old/a.md", "notes/nested"),
			).toBe(false);
			expect(isWithinVaultPath("notes/a.md", "notes/nested")).toBe(false);
			expect(isWithinVaultPath("other/notes/a.md", "notes")).toBe(false);
		});
	});

	describe("normalizeVaultPath", () => {
		for (const input of ["/", "", "   ", ".", "./", "//"]) {
			it(`maps ${JSON.stringify(input)} to the whole vault`, () => {
				expect(normalizeVaultPath(input)).toBe("/");
			});
		}

		it("appends the trailing slash the strip sites depend on", () => {
			expect(normalizeVaultPath("notes")).toBe("notes/");
			expect(normalizeVaultPath("notes/nested")).toBe("notes/nested/");
		});

		it("is idempotent", () => {
			expect(normalizeVaultPath(normalizeVaultPath("notes"))).toBe(
				"notes/",
			);
			expect(normalizeVaultPath(normalizeVaultPath("/"))).toBe("/");
		});

		it("strips surrounding whitespace, slashes and dots", () => {
			expect(normalizeVaultPath("  notes  ")).toBe("notes/");
			expect(normalizeVaultPath("/notes/")).toBe("notes/");
			expect(normalizeVaultPath("./notes")).toBe("notes/");
		});

		it("collapses repeated separators", () => {
			expect(normalizeVaultPath("notes//nested")).toBe("notes/nested/");
		});

		// PublishFile and BackgroundEngine strip this value with a plain
		// String.replace, so whatever isWithinVaultPath accepts must strip to a
		// clean vault-relative path with no leading slash left behind.
		it("produces a value that strips cleanly for every in-scope path", () => {
			for (const input of ["notes", "/notes/", "./notes", "notes//"]) {
				const stored = normalizeVaultPath(input);

				expect(isWithinVaultPath("notes/a.md", stored)).toBe(true);
				expect("notes/a.md".replace(stored, "")).toBe("a.md");
				expect("notes/deep/a.md".replace(stored, "")).toBe("deep/a.md");
			}
		});
	});

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
		it("returns a 40-character hex SHA1 hash", async () => {
			const hash = await generateBlobHash("hello world");
			expect(hash).toMatch(/^[0-9a-f]{40}$/);
		});

		it("returns consistent hash for same input", async () => {
			const hash1 = await generateBlobHash("test content");
			const hash2 = await generateBlobHash("test content");
			expect(hash1).toBe(hash2);
		});

		it("returns different hashes for different input", async () => {
			const hash1 = await generateBlobHash("content A");
			const hash2 = await generateBlobHash("content B");
			expect(hash1).not.toBe(hash2);
		});

		it("handles empty string", async () => {
			const hash = await generateBlobHash("");
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

	describe("cleanQueryResult", () => {
		it("strips leading YAML frontmatter", () => {
			const input =
				"---\ntitle: Test\npublish: true\n---\n# Hello\nContent here";

			const result = cleanQueryResult(input);

			expect(result).not.toContain("---");
			expect(result).not.toContain("title: Test");
			expect(result).toContain("Hello");
			expect(result).toContain("Content here");
		});

		it("does not strip horizontal rules that are not frontmatter", () => {
			const input = "Some text\n\n---\n\nMore text";

			const result = cleanQueryResult(input);

			expect(result).toContain("Some text");
			expect(result).toContain("More text");
		});

		it("handles content without frontmatter", () => {
			const input = "# Just a heading\nSome content";

			const result = cleanQueryResult(input);

			expect(result).toContain("Just a heading");
			expect(result).toContain("Some content");
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
