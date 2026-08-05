import assert from "node:assert";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";

function createMockRepo(
	existingFiles: string[],
	fileContents?: Record<string, string>,
): QuartzFileSource {
	return {
		readFile: async (path: string) => {
			if (!existingFiles.includes(path)) {
				return null;
			}

			return fileContents?.[path] ?? "";
		},
		writeFile: async () => {},
		listDirectory: async () => [],
		exists: async (path: string) => existingFiles.includes(path),
	};
}

describe("QuartzVersionDetector", () => {
	describe("detectQuartzVersion", () => {
		it("detects v5-yaml when quartz.config.yaml exists", async () => {
			const repo = createMockRepo(["quartz.config.yaml"]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "v5-yaml");
		});

		it("detects v5-json when only quartz.plugins.json exists", async () => {
			const repo = createMockRepo(["quartz.plugins.json"]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "v5-json");
		});

		it("detects v4 when only quartz.config.ts exists", async () => {
			const repo = createMockRepo(["quartz.config.ts"]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "v4");
		});

		it("returns unknown when no config files exist", async () => {
			const repo = createMockRepo([]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "unknown");
		});

		it("prefers YAML over JSON when both exist", async () => {
			const repo = createMockRepo([
				"quartz.config.yaml",
				"quartz.plugins.json",
			]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "v5-yaml");
		});

		it("prefers v5-json over v4 when both exist", async () => {
			const repo = createMockRepo([
				"quartz.plugins.json",
				"quartz.config.ts",
			]);

			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);

			assert.strictEqual(version, "v5-json");
		});
	});

	describe("getQuartzPackageVersion", () => {
		it("reads version from package.json", async () => {
			const repo = createMockRepo(["package.json"], {
				"package.json": JSON.stringify({ version: "5.2.0" }),
			});

			const version =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);

			assert.strictEqual(version, "5.2.0");
		});

		it("returns null when package.json is missing", async () => {
			const repo = createMockRepo([]);

			const version =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);

			assert.strictEqual(version, null);
		});

		it("returns null when version field is absent", async () => {
			const repo = createMockRepo(["package.json"], {
				"package.json": JSON.stringify({ name: "quartz" }),
			});

			const version =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);

			assert.strictEqual(version, null);
		});
	});
});
