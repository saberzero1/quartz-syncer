import assert from "node:assert";
import {
	isObjectSource,
	getPluginName,
	getPluginSourceKey,
	resolveSourceToGitUrl,
	getSourceRef,
} from "./QuartzPluginUtils";

describe("QuartzPluginUtils", () => {
	describe("isObjectSource", () => {
		it("returns true for object with repo field", () => {
			assert.strictEqual(
				isObjectSource({ repo: "github:org/repo" }),
				true,
			);
		});

		it("returns true for object with all fields", () => {
			assert.strictEqual(
				isObjectSource({
					repo: "github:org/repo",
					subdir: "plugin",
					ref: "main",
					name: "my-plugin",
				}),
				true,
			);
		});

		it("returns false for string source", () => {
			assert.strictEqual(isObjectSource("github:org/repo"), false);
		});
	});

	describe("getPluginName", () => {
		const TESTS: Array<{
			name: string;
			input: Parameters<typeof getPluginName>[0];
			expected: string;
		}> = [
			{
				name: "extracts name from github shorthand",
				input: "github:quartz-community/explorer",
				expected: "explorer",
			},
			{
				name: "strips ref from github shorthand",
				input: "github:quartz-community/explorer#v2",
				expected: "explorer",
			},
			{
				name: "extracts name from git+https URL",
				input: "git+https://github.com/user/my-plugin.git",
				expected: "my-plugin",
			},
			{
				name: "extracts name from plain https URL",
				input: "https://github.com/user/some-plugin.git",
				expected: "some-plugin",
			},
			{
				name: "uses name field from object source",
				input: {
					repo: "github:saberzero1/quartz-themes",
					name: "quartz-themes",
				},
				expected: "quartz-themes",
			},
			{
				name: "derives name from repo when name is absent",
				input: {
					repo: "github:saberzero1/quartz-themes",
					subdir: "plugin",
				},
				expected: "quartz-themes",
			},
			{
				name: "handles local path",
				input: "/local/path/to/my-plugin",
				expected: "my-plugin",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(getPluginName(test.input), test.expected);
			});
		}
	});

	describe("getPluginSourceKey", () => {
		it("strips ref from string source", () => {
			assert.strictEqual(
				getPluginSourceKey("github:org/repo#v2"),
				"github:org/repo",
			);
		});

		it("returns string source without ref as-is", () => {
			assert.strictEqual(
				getPluginSourceKey("github:org/repo"),
				"github:org/repo",
			);
		});

		it("includes subdir for object sources", () => {
			assert.strictEqual(
				getPluginSourceKey({
					repo: "github:org/repo",
					subdir: "plugin",
				}),
				"github:org/repo::plugin",
			);
		});

		it("omits subdir separator when no subdir", () => {
			assert.strictEqual(
				getPluginSourceKey({ repo: "github:org/repo" }),
				"github:org/repo",
			);
		});

		it("strips ref from object source repo", () => {
			assert.strictEqual(
				getPluginSourceKey({
					repo: "github:org/repo#main",
					subdir: "pkg",
				}),
				"github:org/repo::pkg",
			);
		});
	});

	describe("resolveSourceToGitUrl", () => {
		const TESTS: Array<{
			name: string;
			input: Parameters<typeof resolveSourceToGitUrl>[0];
			expected: string;
		}> = [
			{
				name: "resolves github shorthand",
				input: "github:org/repo",
				expected: "https://github.com/org/repo.git",
			},
			{
				name: "resolves github shorthand with ref",
				input: "github:org/repo#v2",
				expected: "https://github.com/org/repo.git",
			},
			{
				name: "strips git+ prefix from URL",
				input: "git+https://example.com/r.git",
				expected: "https://example.com/r.git",
			},
			{
				name: "passes through plain https URL",
				input: "https://github.com/org/repo.git",
				expected: "https://github.com/org/repo.git",
			},
			{
				name: "resolves object source repo field",
				input: { repo: "github:org/repo" },
				expected: "https://github.com/org/repo.git",
			},
			{
				name: "resolves object source with ref",
				input: { repo: "github:org/repo#main" },
				expected: "https://github.com/org/repo.git",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					resolveSourceToGitUrl(test.input),
					test.expected,
				);
			});
		}
	});

	describe("getSourceRef", () => {
		it("extracts ref from string source", () => {
			assert.strictEqual(getSourceRef("github:org/repo#v2"), "v2");
		});

		it("returns undefined when no ref in string", () => {
			assert.strictEqual(getSourceRef("github:org/repo"), undefined);
		});

		it("returns ref from object source", () => {
			assert.strictEqual(
				getSourceRef({ repo: "github:org/repo", ref: "main" }),
				"main",
			);
		});

		it("returns undefined when no ref in object", () => {
			assert.strictEqual(
				getSourceRef({ repo: "github:org/repo" }),
				undefined,
			);
		});
	});
});
