import { describe, it, beforeEach } from "@jest/globals";
import assert from "node:assert";
import { QuartzTemplateService } from "./QuartzTemplateService";
import type { QuartzV5Config } from "./QuartzConfigTypes";

function makeConfig(overrides?: Partial<QuartzV5Config>): QuartzV5Config {
	return {
		configuration: {
			pageTitle: "Test Site",
			enableSPA: true,
			locale: "en-US",
			theme: {
				fontOrigin: "googleFonts",
				cdnCaching: true,
				typography: {
					header: "Schibsted Grotesk",
					body: "Source Sans Pro",
					code: "IBM Plex Mono",
				},
				colors: {
					lightMode: {
						light: "#faf8f8",
						lightgray: "#e5e5e5",
						gray: "#b8b8b8",
						darkgray: "#4e4e4e",
						dark: "#2b2b2b",
						secondary: "#284b63",
						tertiary: "#84a59d",
						highlight: "rgba(143, 159, 169, 0.15)",
						textHighlight: "#fff23688",
					},
					darkMode: {
						light: "#161618",
						lightgray: "#393639",
						gray: "#646464",
						darkgray: "#d4d4d4",
						dark: "#ebebec",
						secondary: "#7b97aa",
						tertiary: "#84a59d",
						highlight: "rgba(143, 159, 169, 0.15)",
						textHighlight: "#fff23688",
					},
				},
			},
		},
		plugins: [
			{
				source: "github:quartz-community/explorer",
				enabled: true,
				order: 50,
			},
		],
		...overrides,
	};
}

describe("QuartzTemplateService", () => {
	let mockRepo: {
		listDirectory: jest.Mock;
		getRawFile: jest.Mock;
	};
	let service: QuartzTemplateService;

	beforeEach(() => {
		mockRepo = {
			listDirectory: jest.fn(),
			getRawFile: jest.fn(),
		};
		service = new QuartzTemplateService(mockRepo as never);
	});

	describe("listTemplateNames", () => {
		it("returns directory names from templates dir", async () => {
			mockRepo.listDirectory.mockResolvedValue([
				{ name: "default", type: "tree" },
				{ name: "blog", type: "tree" },
				{ name: "README.md", type: "blob" },
			]);

			const names = await service.listTemplateNames();

			assert.deepStrictEqual(names, ["default", "blog"]);
			assert.strictEqual(
				mockRepo.listDirectory.mock.calls[0][0],
				"quartz/cli/templates",
			);
		});

		it("returns empty array when directory does not exist", async () => {
			mockRepo.listDirectory.mockResolvedValue([]);

			const names = await service.listTemplateNames();

			assert.deepStrictEqual(names, []);
		});
	});

	describe("readTemplate", () => {
		it("reads and parses a template config", async () => {
			const yamlContent = [
				"configuration:",
				"  pageTitle: Blog Template",
				"  enableSPA: true",
				"  locale: en-US",
				"  theme:",
				"    fontOrigin: googleFonts",
				"    cdnCaching: true",
				"    typography:",
				"      header: Inter",
				"      body: Inter",
				"      code: Fira Code",
				"    colors:",
				"      lightMode:",
				'        light: "#ffffff"',
				'        lightgray: "#e5e5e5"',
				'        gray: "#b8b8b8"',
				'        darkgray: "#4e4e4e"',
				'        dark: "#2b2b2b"',
				'        secondary: "#284b63"',
				'        tertiary: "#84a59d"',
				'        highlight: "rgba(143,159,169,0.15)"',
				'        textHighlight: "#fff23688"',
				"      darkMode:",
				'        light: "#161618"',
				'        lightgray: "#393639"',
				'        gray: "#646464"',
				'        darkgray: "#d4d4d4"',
				'        dark: "#ebebec"',
				'        secondary: "#7b97aa"',
				'        tertiary: "#84a59d"',
				'        highlight: "rgba(143,159,169,0.15)"',
				'        textHighlight: "#fff23688"',
				"plugins:",
				"  - source: github:quartz-community/explorer",
				"    enabled: true",
				"    order: 10",
			].join("\n");

			const encoded = Buffer.from(yamlContent).toString("base64");

			mockRepo.getRawFile.mockResolvedValue({
				content: encoded,
				sha: "abc123",
				path: "quartz/cli/templates/blog/quartz.config.yaml",
				type: "file",
			});

			const template = await service.readTemplate("blog");

			assert.ok(template);
			assert.strictEqual(template.name, "blog");
			assert.strictEqual(
				template.config.configuration.pageTitle,
				"Blog Template",
			);
			assert.strictEqual(template.config.plugins[0].order, 10);
		});

		it("returns null when template config file not found", async () => {
			mockRepo.getRawFile.mockRejectedValue(new Error("Not found"));

			const template = await service.readTemplate("nonexistent");

			assert.strictEqual(template, null);
		});
	});

	describe("getAvailableFrameNames", () => {
		it("includes built-in frames plus template names", async () => {
			mockRepo.listDirectory.mockResolvedValue([
				{ name: "blog", type: "tree" },
				{ name: "docs", type: "tree" },
			]);

			const frames = await service.getAvailableFrameNames();

			assert.ok(frames.includes("default"));
			assert.ok(frames.includes("full-width"));
			assert.ok(frames.includes("minimal"));
			assert.ok(frames.includes("blog"));
			assert.ok(frames.includes("docs"));
		});

		it("deduplicates built-in names", async () => {
			mockRepo.listDirectory.mockResolvedValue([
				{ name: "default", type: "tree" },
				{ name: "minimal", type: "tree" },
			]);

			const frames = await service.getAvailableFrameNames();

			const defaultCount = frames.filter((f) => f === "default").length;

			assert.strictEqual(defaultCount, 1);
		});
	});

	describe("applyTemplate", () => {
		it("replaces current config with template values", () => {
			const current = makeConfig();
			const templateConfig = makeConfig({
				configuration: {
					...current.configuration,
					pageTitle: "From Template",
					enableSPA: false,
				},
				plugins: [
					{
						source: "github:quartz-community/search",
						enabled: true,
						order: 20,
					},
				],
				layout: { groups: { toolbar: { priority: 35 } } },
			});

			const template = { name: "blog", config: templateConfig };

			service.applyTemplate(current, template);

			assert.strictEqual(
				current.configuration.pageTitle,
				"From Template",
			);
			assert.strictEqual(current.configuration.enableSPA, false);
			assert.strictEqual(current.plugins.length, 1);
			assert.strictEqual(current.plugins[0].order, 20);
			assert.deepStrictEqual(
				current.layout?.groups?.toolbar?.priority,
				35,
			);
		});

		it("clears layout when template has no layout", () => {
			const current = makeConfig();
			current.layout = { groups: { toolbar: { priority: 10 } } };

			const templateConfig = makeConfig();
			delete templateConfig.layout;

			service.applyTemplate(current, {
				name: "minimal",
				config: templateConfig,
			});

			assert.strictEqual(current.layout, undefined);
		});
	});
});
