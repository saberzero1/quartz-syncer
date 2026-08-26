import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("DOM contract", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	describe("Status bar", function () {
		it("has data-qs attribute", async function () {
			const count = await browser.executeObsidian(() => {
				return document.querySelectorAll('[data-qs="statusbar"]')
					.length;
			});
			expect(count).toBe(1);
		});

		it("has data-qs-state attribute", async function () {
			const state = await browser.executeObsidian(() => {
				return document
					.querySelector('[data-qs="statusbar"]')
					?.getAttribute("data-qs-state");
			});
			expect(state).toBeTruthy();
			expect(["ready", "compiling", "error", "unconfigured"]).toContain(
				state,
			);
		});
	});

	describe("Publication center", function () {
		before(async function () {
			await browser.executeObsidian(({ app }) => {
				(
					app as unknown as {
						commands: {
							executeCommandById: (id: string) => void;
						};
					}
				).commands.executeCommandById(
					"quartz-syncer:open-publish-modal",
				);
			});
			await browser.waitUntil(
				async () => {
					const loaded = await browser.executeObsidian(() => {
						const modal = document.querySelector(".qs-pub-center");
						if (!modal) return false;
						const loading = modal.querySelector(
							".pub-center-loading",
						);
						return loading === null;
					});
					return loaded;
				},
				{ timeout: 15_000, interval: 500 },
			);
		});

		after(async function () {
			await browser.executeObsidian(() => {
				const container =
					document.querySelector(".qs-pub-center")?.parentElement;
				if (container instanceof HTMLElement) container.click();
			});
			await new Promise((resolve) => setTimeout(resolve, 500));
		});

		it("has pub-center data-qs", async function () {
			const count = await browser.executeObsidian(() => {
				return document.querySelectorAll('[data-qs="pub-center"]')
					.length;
			});
			expect(count).toBe(1);
		});

		it("has pub-tab data-qs when configured", async function () {
			const result = await browser.executeObsidian(() => {
				const tabs = document.querySelectorAll('[data-qs="pub-tab"]');
				const configured = Boolean(
					(
						app as unknown as {
							plugins: {
								plugins: Record<
									string,
									{ settings?: { gitRemoteUrl?: string } }
								>;
							};
						}
					).plugins.plugins["quartz-syncer"]?.settings?.gitRemoteUrl,
				);
				return { count: tabs.length, configured };
			});
			if (result.configured) {
				expect(result.count).toBe(2);
			} else {
				expect(result.count).toBe(0);
			}
		});

		it("has pub-publish-btn when configured", async function () {
			const result = await browser.executeObsidian(() => {
				const publish = document.querySelector(
					'[data-qs="pub-publish-btn"]',
				);
				const configured = Boolean(
					(
						app as unknown as {
							plugins: {
								plugins: Record<
									string,
									{ settings?: { gitRemoteUrl?: string } }
								>;
							};
						}
					).plugins.plugins["quartz-syncer"]?.settings?.gitRemoteUrl,
				);
				return {
					hasPublish: publish !== null,
					configured,
				};
			});
			if (result.configured) {
				expect(result.hasPublish).toBe(true);
			} else {
				expect(result.hasPublish).toBe(false);
			}
		});

		it("has pub-search when configured", async function () {
			const result = await browser.executeObsidian(() => {
				const search = document.querySelectorAll(
					'[data-qs="pub-search"]',
				);
				const configured = Boolean(
					(
						app as unknown as {
							plugins: {
								plugins: Record<
									string,
									{ settings?: { gitRemoteUrl?: string } }
								>;
							};
						}
					).plugins.plugins["quartz-syncer"]?.settings?.gitRemoteUrl,
				);
				return { count: search.length, configured };
			});
			if (result.configured) {
				expect(result.count).toBe(1);
			} else {
				expect(result.count).toBe(0);
			}
		});
	});
});
