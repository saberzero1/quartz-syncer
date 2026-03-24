import assert from "node:assert";
import { QuartzPluginManager } from "./QuartzPluginManager";
import type { QuartzV5Config } from "./QuartzConfigTypes";

function makeConfig(plugins: QuartzV5Config["plugins"] = []): QuartzV5Config {
	return {
		configuration: {
			pageTitle: "Test",
			enableSPA: true,
			locale: "en-US",
			theme: {
				fontOrigin: "googleFonts",
				cdnCaching: true,
				typography: {
					header: "Inter",
					body: "Inter",
					code: "Fira Code",
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
		plugins,
	};
}

describe("QuartzPluginManager", () => {
	const manager = new QuartzPluginManager();

	describe("addPlugin", () => {
		it("adds a plugin with default options", () => {
			const config = makeConfig();

			const entry = manager.addPlugin(
				config,
				"github:quartz-community/explorer",
			);

			assert.strictEqual(config.plugins.length, 1);
			assert.strictEqual(
				entry.source,
				"github:quartz-community/explorer",
			);
			assert.strictEqual(entry.enabled, true);
			assert.strictEqual(entry.order, 50);
			assert.deepStrictEqual(entry.options, {});
		});

		it("adds a plugin with custom options", () => {
			const config = makeConfig();

			const entry = manager.addPlugin(
				config,
				"github:quartz-community/graph",
				{ enabled: false, order: 10, options: { depth: 2 } },
			);

			assert.strictEqual(entry.enabled, false);
			assert.strictEqual(entry.order, 10);
			assert.deepStrictEqual(entry.options, { depth: 2 });
		});

		it("adds a plugin with object source", () => {
			const config = makeConfig();

			const entry = manager.addPlugin(config, {
				repo: "github:saberzero1/quartz-themes",
				subdir: "plugin",
				name: "quartz-themes",
			});

			assert.strictEqual(config.plugins.length, 1);
			assert.deepStrictEqual(entry.source, {
				repo: "github:saberzero1/quartz-themes",
				subdir: "plugin",
				name: "quartz-themes",
			});
		});

		it("throws when adding a duplicate plugin", () => {
			const config = makeConfig([
				{
					source: "github:quartz-community/explorer",
					enabled: true,
				},
			]);

			assert.throws(
				() =>
					manager.addPlugin(
						config,
						"github:quartz-community/explorer",
					),
				/already in the configuration/,
			);
		});

		it("appends to the end of the plugins array", () => {
			const config = makeConfig([
				{
					source: "github:quartz-community/search",
					enabled: true,
				},
			]);

			manager.addPlugin(config, "github:quartz-community/graph");

			assert.strictEqual(config.plugins.length, 2);
			assert.strictEqual(
				config.plugins[1].source,
				"github:quartz-community/graph",
			);
		});
	});

	describe("removePlugin", () => {
		it("removes an existing plugin", () => {
			const config = makeConfig([
				{
					source: "github:quartz-community/explorer",
					enabled: true,
				},
				{
					source: "github:quartz-community/search",
					enabled: true,
				},
			]);

			const removed = manager.removePlugin(
				config,
				"github:quartz-community/explorer",
			);

			assert.strictEqual(config.plugins.length, 1);
			assert.strictEqual(
				removed.source,
				"github:quartz-community/explorer",
			);
			assert.strictEqual(
				config.plugins[0].source,
				"github:quartz-community/search",
			);
		});

		it("throws when removing a non-existent plugin", () => {
			const config = makeConfig();

			assert.throws(
				() =>
					manager.removePlugin(
						config,
						"github:quartz-community/missing",
					),
				/not found in the configuration/,
			);
		});
	});

	describe("findPlugin", () => {
		it("finds an existing plugin", () => {
			const config = makeConfig([
				{
					source: "github:quartz-community/explorer",
					enabled: true,
					order: 30,
				},
			]);

			const found = manager.findPlugin(
				config,
				"github:quartz-community/explorer",
			);

			assert.ok(found);
			assert.strictEqual(found.order, 30);
		});

		it("returns undefined for a non-existent plugin", () => {
			const config = makeConfig();

			const found = manager.findPlugin(
				config,
				"github:quartz-community/missing",
			);

			assert.strictEqual(found, undefined);
		});
	});
});
