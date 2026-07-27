import { browser, expect } from "@wdio/globals";
import { before, describe, it } from "mocha";
import { obsidianPage } from "wdio-obsidian-service";

describe("Publication center", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	const openPublicationCenter = async (): Promise<void> => {
		await browser.executeObsidian(({ app }) => {
			(
				app as unknown as {
					commands: { executeCommandById: (id: string) => void };
				}
			).commands.executeCommandById("quartz-syncer:open-publish-modal");
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
	};

	const closePublicationCenter = async (): Promise<void> => {
		await browser.executeObsidian(() => {
			const modal = document.querySelector(".qs-pub-center");
			const container = modal?.parentElement;
			if (container instanceof HTMLElement) {
				container.click();
			}
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
	};

	it("renders the unconfigured state and structure", async function () {
		await openPublicationCenter();

		const modalState = await browser.executeObsidian(() => {
			const modal = document.querySelector(".qs-pub-center");
			const title = modal?.querySelector(".modal-title")?.textContent ?? "";
			const header = modal?.querySelector(".pub-center-header");
			const tree = modal?.querySelector(".pub-center-tree");
			const message = tree?.textContent ?? "";
			return {
				hasModal: modal !== null,
				hasHeader: header !== null,
				hasTree: tree !== null,
				title,
				message,
			};
		});
		expect(modalState.hasModal).toBe(true);
		expect(modalState.title).toBe("Publication center");
		expect(modalState.hasHeader).toBe(true);
		expect(modalState.hasTree).toBe(true);
			expect(modalState.message).toContain(
			"Configure your git repository in settings to get started.",
		);

		await closePublicationCenter();
	});

	it("closes via the close button", async function () {
		await openPublicationCenter();

		const hasCloseButton = await browser.executeObsidian(() => {
			return (
				document.querySelector(".qs-pub-center .modal-close-button") !== null
			);
		});
		expect(hasCloseButton).toBe(true);

		await browser.executeObsidian(() => {
			const closeButton = document.querySelector(
				".qs-pub-center .modal-close-button",
			);
			if (closeButton instanceof HTMLElement) {
				closeButton.click();
			}
		});
		await new Promise((resolve) => setTimeout(resolve, 300));

		const isClosed = await browser.executeObsidian(() => {
			return document.querySelector(".qs-pub-center") === null;
		});
		expect(isClosed).toBe(true);
	});
});
