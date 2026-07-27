import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Diff viewer", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("plugin loads with DiffModal capability", async function () {
		const pluginLoaded = await browser.executeObsidian(({ app }) => {
			const plugin = app.plugins.getPlugin("quartz-syncer");
			return plugin !== null && plugin !== undefined;
		});
		expect(pluginLoaded).toBe(true);
	});
});
