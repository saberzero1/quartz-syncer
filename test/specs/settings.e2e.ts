import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Settings", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("renders 6 settings pages", async function () {
		await browser.executeObsidian(({ app }) => {
			app.setting.open();
		});
		await browser.pause(500);

		const pageCount = await browser.executeObsidian(({ app }) => {
			const tab = app.setting.pluginTabs.find(
				(t: { plugin?: { manifest?: { id?: string } } }) =>
					t.plugin?.manifest?.id === "quartz-syncer",
			);
			if (!tab || !("getSettingDefinitions" in tab)) return 0;
			const defs = (
				tab as { getSettingDefinitions: () => { type?: string }[] }
			).getSettingDefinitions();
			return defs.filter((d: { type?: string }) => d.type === "page")
				.length;
		});
		expect(pageCount).toBe(6);

		await browser.executeObsidian(({ app }) => {
			app.setting.close();
		});
	});

	it("integration page has items defined", async function () {
		const hasItems = await browser.executeObsidian(({ app }) => {
			const tab = app.setting.pluginTabs.find(
				(t: { plugin?: { manifest?: { id?: string } } }) =>
					t.plugin?.manifest?.id === "quartz-syncer",
			);
			if (!tab || !("getSettingDefinitions" in tab)) return false;
			const defs = (
				tab as {
					getSettingDefinitions: () => {
						type?: string;
						name?: string;
						items?: unknown[];
					}[];
				}
			).getSettingDefinitions();
			const integrationPage = defs.find(
				(d) => d.type === "page" && d.name === "Integration",
			);
			return (
				integrationPage !== undefined &&
				Array.isArray(integrationPage.items) &&
				integrationPage.items.length > 0
			);
		});
		expect(hasItems).toBe(true);
	});
});
