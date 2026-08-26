import { browser, expect } from "@wdio/globals";
import { before, describe, it } from "mocha";
import { obsidianPage } from "wdio-obsidian-service";

describe("Onboarding wizard", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	const openWizard = async (): Promise<void> => {
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
		await new Promise((resolve) => setTimeout(resolve, 300));
	};

	it("renders the method step and closes", async function () {
		await openWizard();

		const wizardState = await browser.executeObsidian(() => {
			const wizard = document.querySelector(
				".quartz-syncer-onboarding-wizard",
			);
			return {
				hasWizard: wizard !== null,
				stepText: wizard?.textContent ?? "",
			};
		});
		expect(wizardState.hasWizard).toBe(true);
		expect(wizardState.stepText).toContain("Create new Quartz site");
		expect(wizardState.stepText).toContain("Connect existing repository");

		await browser.executeObsidian(() => {
			const wizard = document.querySelector(
				".quartz-syncer-onboarding-wizard",
			);
			if (wizard) {
				const container = wizard.closest(".modal-container");
				if (container instanceof HTMLElement) {
					container.remove();
				}
			}
		});
	});
});
