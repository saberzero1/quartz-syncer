import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Onboarding wizard", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("opens the onboarding wizard via command", async function () {
		const opened = await browser.executeObsidian(({ app }) => {
			try {
				(
					app as unknown as {
						commands: {
							executeCommandById: (id: string) => void;
						};
					}
				).commands.executeCommandById("quartz-syncer:setup-wizard");
				return true;
			} catch {
				return false;
			}
		});
		expect(opened).toBe(true);
	});
});
