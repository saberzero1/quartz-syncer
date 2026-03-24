import assert from "node:assert";
import { QuartzConfigService } from "./QuartzConfigService";
import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { Base64 } from "js-base64";

function createMockRepo(files: Record<string, string>): RepositoryConnection {
	return {
		getRawFile: async (path: string) => {
			const content = files[path];

			if (content === undefined) {
				throw new Error(`File not found: ${path}`);
			}

			return {
				content: Base64.encode(content),
				sha: "mock-sha",
				path,
				type: "file" as const,
			};
		},
	} as unknown as RepositoryConnection;
}

const SAMPLE_YAML = `# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
configuration:
  pageTitle: My Quartz Site
  enableSPA: true
  locale: en-US
  theme:
    fontOrigin: googleFonts
    cdnCaching: true
    typography:
      header: Schibsted Grotesk
      body: Source Sans Pro
      code: IBM Plex Mono
    colors:
      lightMode:
        light: "#faf8f8"
        lightgray: "#e5e5e5"
        gray: "#b8b8b8"
        darkgray: "#4e4e4e"
        dark: "#2b2b2b"
        secondary: "#284b63"
        tertiary: "#84a59d"
        highlight: "rgba(143, 159, 169, 0.15)"
        textHighlight: "#fff23688"
      darkMode:
        light: "#161618"
        lightgray: "#393639"
        gray: "#646464"
        darkgray: "#d4d4d4"
        dark: "#ebebec"
        secondary: "#7b97aa"
        tertiary: "#84a59d"
        highlight: "rgba(143, 159, 169, 0.15)"
        textHighlight: "#fff23688"

# User plugins
plugins:
  - source: "github:quartz-community/explorer"
    enabled: true
    options: {}
    order: 50
  - source: "github:quartz-community/search"
    enabled: false
    options: {}
`;

const SAMPLE_JSON = JSON.stringify(
	{
		configuration: {
			pageTitle: "JSON Site",
			enableSPA: false,
			locale: "en-US",
			theme: {
				fontOrigin: "googleFonts",
				cdnCaching: true,
				typography: { header: "Arial", body: "Arial", code: "Mono" },
				colors: {
					lightMode: {
						light: "#fff",
						lightgray: "#eee",
						gray: "#999",
						darkgray: "#333",
						dark: "#000",
						secondary: "#284b63",
						tertiary: "#84a59d",
						highlight: "rgba(0,0,0,0.1)",
						textHighlight: "#ff0",
					},
					darkMode: {
						light: "#000",
						lightgray: "#111",
						gray: "#666",
						darkgray: "#ccc",
						dark: "#fff",
						secondary: "#7b97aa",
						tertiary: "#84a59d",
						highlight: "rgba(0,0,0,0.1)",
						textHighlight: "#ff0",
					},
				},
			},
		},
		plugins: [
			{
				source: "github:quartz-community/explorer",
				enabled: true,
			},
		],
	},
	null,
	2,
);

const SAMPLE_LOCK = JSON.stringify({
	version: "1.0.0",
	plugins: {
		explorer: {
			source: "github:quartz-community/explorer",
			resolved: "https://github.com/quartz-community/explorer.git",
			commit: "abc123",
			installedAt: "2026-03-22T21:03:34.275Z",
		},
	},
});

describe("QuartzConfigService", () => {
	describe("readConfig (YAML)", () => {
		it("parses YAML config into typed object", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
			});
			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();

			assert.strictEqual(
				config.configuration.pageTitle,
				"My Quartz Site",
			);
			assert.strictEqual(config.configuration.enableSPA, true);
			assert.strictEqual(config.configuration.locale, "en-US");
			assert.strictEqual(config.plugins.length, 2);
			assert.strictEqual(
				config.plugins[0].source,
				"github:quartz-community/explorer",
			);
			assert.strictEqual(config.plugins[0].enabled, true);
			assert.strictEqual(config.plugins[1].enabled, false);
		});

		it("sets config format to yaml", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
			});
			const service = new QuartzConfigService(repo);
			await service.readConfig();

			assert.strictEqual(service.getConfigFormat(), "yaml");
		});

		it("stores YAML Document for roundtrip", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
			});
			const service = new QuartzConfigService(repo);
			await service.readConfig();

			assert.notStrictEqual(service.getRawYamlDocument(), null);
		});
	});

	describe("readConfig (JSON fallback)", () => {
		it("falls back to JSON when YAML is missing", async () => {
			const repo = createMockRepo({
				"quartz.plugins.json": SAMPLE_JSON,
			});
			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();

			assert.strictEqual(config.configuration.pageTitle, "JSON Site");
			assert.strictEqual(config.configuration.enableSPA, false);
			assert.strictEqual(service.getConfigFormat(), "json");
		});

		it("does not create YAML Document for JSON config", async () => {
			const repo = createMockRepo({
				"quartz.plugins.json": SAMPLE_JSON,
			});
			const service = new QuartzConfigService(repo);
			await service.readConfig();

			assert.strictEqual(service.getRawYamlDocument(), null);
		});
	});

	describe("readConfig (no config)", () => {
		it("throws when no config file exists", async () => {
			const repo = createMockRepo({});
			const service = new QuartzConfigService(repo);

			await assert.rejects(() => service.readConfig(), {
				message:
					"No Quartz v5 configuration file found. Expected quartz.config.yaml or quartz.plugins.json.",
			});
		});
	});

	describe("serializeConfig", () => {
		it("preserves YAML comments on roundtrip", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
			});
			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();

			const serialized = service.serializeConfig(config);

			assert.ok(
				serialized.includes("# User plugins"),
				"User comment should be preserved",
			);
			assert.ok(
				serialized.includes("yaml-language-server"),
				"Schema comment should be preserved",
			);
		});

		it("preserves schema comment when creating new document", () => {
			const service = new QuartzConfigService(createMockRepo({}));
			const config = {
				configuration: {
					pageTitle: "Test",
					enableSPA: true,
					locale: "en-US",
					theme: {
						fontOrigin: "googleFonts" as const,
						cdnCaching: true,
						typography: {
							header: "Arial",
							body: "Arial",
							code: "Mono",
						},
						colors: {
							lightMode: {
								light: "#fff",
								lightgray: "#eee",
								gray: "#999",
								darkgray: "#333",
								dark: "#000",
								secondary: "#284b63",
								tertiary: "#84a59d",
								highlight: "rgba(0,0,0,0.1)",
								textHighlight: "#ff0",
							},
							darkMode: {
								light: "#000",
								lightgray: "#111",
								gray: "#666",
								darkgray: "#ccc",
								dark: "#fff",
								secondary: "#7b97aa",
								tertiary: "#84a59d",
								highlight: "rgba(0,0,0,0.1)",
								textHighlight: "#ff0",
							},
						},
					},
				},
				plugins: [],
			};

			const serialized = service.serializeConfig(config);

			assert.ok(
				serialized.includes("yaml-language-server"),
				"Schema comment should be added to new documents",
			);
		});

		it("serializes JSON config as formatted JSON", async () => {
			const repo = createMockRepo({
				"quartz.plugins.json": SAMPLE_JSON,
			});
			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();

			const serialized = service.serializeConfig(config);
			const parsed = JSON.parse(serialized);

			assert.strictEqual(parsed.configuration.pageTitle, "JSON Site");
			assert.ok(serialized.endsWith("\n"), "Should end with newline");
		});
	});

	describe("writeConfig", () => {
		it("writes YAML config to the correct path", async () => {
			const writtenFiles = new Map<string, string>();
			let writtenMessage = "";

			const repo = {
				getRawFile: async (path: string) => {
					if (path === "quartz.config.yaml") {
						return {
							content: Base64.encode(SAMPLE_YAML),
							sha: "mock-sha",
							path,
							type: "file" as const,
						};
					}
					throw new Error(`File not found: ${path}`);
				},
				writeRawFiles: async (
					files: Map<string, string>,
					message: string,
				) => {
					for (const [k, v] of files) writtenFiles.set(k, v);
					writtenMessage = message;
				},
			} as unknown as RepositoryConnection;

			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();
			config.configuration.pageTitle = "Updated Title";

			await service.writeConfig(config);

			assert.ok(writtenFiles.has("quartz.config.yaml"));
			assert.ok(
				writtenFiles
					.get("quartz.config.yaml")!
					.includes("Updated Title"),
			);
			assert.ok(writtenMessage.includes("Update Quartz configuration"));
		});

		it("writes JSON config to the correct path", async () => {
			const writtenFiles = new Map<string, string>();

			const repo = {
				getRawFile: async (path: string) => {
					if (path === "quartz.plugins.json") {
						return {
							content: Base64.encode(SAMPLE_JSON),
							sha: "mock-sha",
							path,
							type: "file" as const,
						};
					}
					throw new Error(`File not found: ${path}`);
				},
				writeRawFiles: async (files: Map<string, string>) => {
					for (const [k, v] of files) writtenFiles.set(k, v);
				},
			} as unknown as RepositoryConnection;

			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();
			config.configuration.pageTitle = "New JSON Title";

			await service.writeConfig(config);

			assert.ok(writtenFiles.has("quartz.plugins.json"));
			const parsed = JSON.parse(writtenFiles.get("quartz.plugins.json")!);
			assert.strictEqual(
				parsed.configuration.pageTitle,
				"New JSON Title",
			);
		});

		it("uses custom commit message when provided", async () => {
			let writtenMessage = "";

			const repo = {
				getRawFile: async (path: string) => {
					if (path === "quartz.config.yaml") {
						return {
							content: Base64.encode(SAMPLE_YAML),
							sha: "mock-sha",
							path,
							type: "file" as const,
						};
					}
					throw new Error(`File not found: ${path}`);
				},
				writeRawFiles: async (
					_files: Map<string, string>,
					message: string,
				) => {
					writtenMessage = message;
				},
			} as unknown as RepositoryConnection;

			const service = new QuartzConfigService(repo);
			const config = await service.readConfig();

			await service.writeConfig(config, "Custom commit message");

			assert.strictEqual(writtenMessage, "Custom commit message");
		});
	});

	describe("readLockFile", () => {
		it("parses lock file into typed object", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
				"quartz.lock.json": SAMPLE_LOCK,
			});
			const service = new QuartzConfigService(repo);
			const lock = await service.readLockFile();

			assert.notStrictEqual(lock, null);
			assert.strictEqual(lock!.version, "1.0.0");
			assert.strictEqual(lock!.plugins.explorer.commit, "abc123");
			assert.strictEqual(
				lock!.plugins.explorer.resolved,
				"https://github.com/quartz-community/explorer.git",
			);
		});

		it("returns null when lock file is missing", async () => {
			const repo = createMockRepo({
				"quartz.config.yaml": SAMPLE_YAML,
			});
			const service = new QuartzConfigService(repo);
			const lock = await service.readLockFile();

			assert.strictEqual(lock, null);
		});
	});
});
