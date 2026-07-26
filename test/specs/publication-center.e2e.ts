import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Publication center", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("opens and closes the publication center modal", async function () {
		await browser.executeObsidian(({ app }) => {
			app.commands.executeCommandById(
				"quartz-syncer:open-publish-modal",
			);
		});
		await browser.pause(300);

		const isOpen = await browser.executeObsidian(() => {
			return document.querySelector(".qs-pub-center") !== null;
		});
		expect(isOpen).toBe(true);

		await browser.executeObsidian(() => {
			const modal = document.querySelector(".modal");
			const container = modal?.parentElement;
			if (container instanceof HTMLElement) {
				container.click();
			}
		});
		await browser.pause(300);

		const isClosed = await browser.executeObsidian(() => {
			return document.querySelector(".qs-pub-center") === null;
		});
		expect(isClosed).toBe(true);
	});
});
