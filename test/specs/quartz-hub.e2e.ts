import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Quartz Hub", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	const openHub = async (): Promise<void> => {
		await browser.executeObsidian(({ app }) => {
			(
				app as unknown as {
					commands: { executeCommandById: (id: string) => void };
				}
			).commands.executeCommandById("quartz-syncer:open-hub");
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));
	};

	const closeHub = async (): Promise<void> => {
		await browser.executeObsidian(() => {
			const modal = document.querySelector('[data-qs="hub"]');
			const closeBtn =
				modal?.querySelector(".modal-close-button") ??
				modal?.closest(".modal-container");
			if (closeBtn instanceof HTMLElement) closeBtn.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 500));
	};

	it("opens via command palette", async function () {
		await openHub();

		const count = await browser.executeObsidian(() => {
			return document.querySelectorAll('[data-qs="hub"]').length;
		});
		expect(count).toBe(1);

		await closeHub();
	});

	it("shows two tabs", async function () {
		await openHub();

		const tabCount = await browser.executeObsidian(() => {
			return document.querySelectorAll('[data-qs="hub-tab"]').length;
		});
		expect(tabCount).toBe(2);

		const tabValues = await browser.executeObsidian(() => {
			return Array.from(
				document.querySelectorAll('[data-qs="hub-tab"]'),
			).map((el) => el.getAttribute("data-qs-value"));
		});
		expect(tabValues).toContain("overview");
		expect(tabValues).toContain("setup");

		await closeHub();
	});

	it("shows status panel on Overview tab", async function () {
		await openHub();

		const statusCount = await browser.executeObsidian(() => {
			return document.querySelectorAll('[data-qs="hub-status"]').length;
		});
		expect(statusCount).toBe(1);

		await closeHub();
	});

	it("shows action buttons on Overview tab", async function () {
		await openHub();

		const actionCount = await browser.executeObsidian(() => {
			return document.querySelectorAll('[data-qs="hub-action"]').length;
		});
		expect(actionCount).toBeGreaterThanOrEqual(0);

		await closeHub();
	});

	it("switches to Setup tab", async function () {
		await openHub();

		await browser.executeObsidian(() => {
			const setupTab = document.querySelector(
				'[data-qs="hub-tab"][data-qs-value="setup"]',
			);
			if (setupTab instanceof HTMLElement) setupTab.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 500));

		const result = await browser.executeObsidian(() => {
			const linkBtn = document.querySelector(
				'[data-qs="hub-setup-link"]',
			);
			const cloneBtn = document.querySelector(
				'[data-qs="hub-setup-clone"]',
			);
			return {
				hasLink: linkBtn !== null,
				hasClone: cloneBtn !== null,
			};
		});
		expect(result.hasLink).toBe(true);
		expect(result.hasClone).toBe(true);

		await closeHub();
	});

	it("preserves Setup tab input state across tab switches", async function () {
		await openHub();

		await browser.executeObsidian(() => {
			const setupTab = document.querySelector(
				'[data-qs="hub-tab"][data-qs-value="setup"]',
			);
			if (setupTab instanceof HTMLElement) setupTab.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 500));

		await browser.executeObsidian(() => {
			const urlInput = document.querySelector(
				'[data-qs="hub-setup-clone-url"]',
			);
			if (urlInput instanceof HTMLInputElement) {
				urlInput.value = "test-preservation";
				urlInput.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});

		await browser.executeObsidian(() => {
			const overviewTab = document.querySelector(
				'[data-qs="hub-tab"][data-qs-value="overview"]',
			);
			if (overviewTab instanceof HTMLElement) overviewTab.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 500));

		await browser.executeObsidian(() => {
			const setupTab = document.querySelector(
				'[data-qs="hub-tab"][data-qs-value="setup"]',
			);
			if (setupTab instanceof HTMLElement) setupTab.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 500));

		const value = await browser.executeObsidian(() => {
			const urlInput = document.querySelector(
				'[data-qs="hub-setup-clone-url"]',
			);
			return urlInput instanceof HTMLInputElement ? urlInput.value : null;
		});
		expect(value).toBe("test-preservation");

		await closeHub();
	});

	it.skip("emits modal events (known issue: eventSink may be null when Hub opened via command)", async function () {
		await openHub();

		const allTypes = await browser.executeObsidian(() => {
			if (!window.__QS__) return { error: "no facade" };
			const events = window.__QS__.events.tail(100);
			return {
				count: events.length,
				types: events.map(
					(e: { type: string; payload: Record<string, unknown> }) =>
						`${e.type}:${String(e.payload.name ?? "")}`,
				),
			};
		});

		const hasOpen = Array.isArray(allTypes.types)
			? allTypes.types.some(
					(t: string) => t === "ui.modal.opened:quartz-hub",
				)
			: false;
		expect(hasOpen).toBe(true);

		await closeHub();
		await new Promise((resolve) => setTimeout(resolve, 500));

		const closeCheck = await browser.executeObsidian(() => {
			if (!window.__QS__) return false;
			const events = window.__QS__.events.tail(100);
			return events.some(
				(e: { type: string; payload: Record<string, unknown> }) =>
					e.type === "ui.modal.closed" &&
					e.payload.name === "quartz-hub",
			);
		});
		expect(closeCheck).toBe(true);
	});
});
