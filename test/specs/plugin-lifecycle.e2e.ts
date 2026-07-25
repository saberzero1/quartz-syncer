import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Plugin lifecycle", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("loads the plugin", async function () {
		const isEnabled = await browser.executeObsidian(({ app }) => {
			const plugin = app.plugins.getPlugin("quartz-syncer");
			return plugin !== null && plugin !== undefined;
		});
		expect(isEnabled).toBe(true);
	});

	it("registers the settings tab", async function () {
		const hasTab = await browser.executeObsidian(({ app }) => {
			const plugin = app.plugins.getPlugin("quartz-syncer");
			if (!plugin) return false;
			return app.setting.pluginTabs.some(
				(tab: { plugin?: { manifest?: { id?: string } } }) =>
					tab.plugin?.manifest?.id === "quartz-syncer",
			);
		});
		expect(hasTab).toBe(true);
	});

	it("unloads cleanly", async function () {
		await browser.executeObsidian(async ({ app }) => {
			await app.plugins.disablePlugin("quartz-syncer");
		});

		const isDisabled = await browser.executeObsidian(({ app }) => {
			return app.plugins.getPlugin("quartz-syncer") === null;
		});
		expect(isDisabled).toBe(true);

		await browser.executeObsidian(async ({ app }) => {
			await app.plugins.enablePlugin("quartz-syncer");
		});
	});
});
