import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Operability facade", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		await obsidianPage.openFile("Target.md");
	});

	it("mounts window.__QS__ in dev build", async function () {
		const facadeType = await browser.executeObsidian(() => {
			return typeof window.__QS__;
		});
		expect(facadeType).toBe("object");
	});

	it("snapshot() returns valid structure", async function () {
		const snapshot = await browser.executeObsidian(() => {
			if (!window.__QS__) return null;
			return window.__QS__.snapshot();
		});
		expect(snapshot).not.toBeNull();
		expect(snapshot.contractVersion).toBe(1);
		expect(snapshot.plugin.loaded).toBe(true);
		expect(snapshot.plugin.version).toBeTruthy();
		expect(snapshot.engine).toBeDefined();
		expect(snapshot.settings).toBeDefined();
		expect(snapshot.errors.count).toBe(0);
	});

	it("assert('health.core') passes", async function () {
		const result = await browser.executeObsidian(() => {
			if (!window.__QS__) return null;
			return window.__QS__.assert("health.core");
		});
		expect(result).not.toBeNull();
		expect(result.pass).toBe(true);
	});

	it("events contain plugin.loaded", async function () {
		const events = await browser.executeObsidian(() => {
			if (!window.__QS__) return [];
			return window.__QS__.events.tail(10);
		});
		expect(events.length).toBeGreaterThan(0);
		const loadedEvent = events.find(
			(e: { type: string }) => e.type === "plugin.loaded",
		);
		expect(loadedEvent).toBeDefined();
	});

	it("act('settings.get') returns a value", async function () {
		const result = await browser.executeObsidian(async () => {
			if (!window.__QS__) return null;
			return window.__QS__.act({
				name: "settings.get",
				params: { key: "contentFolder" },
			});
		});
		expect(result).not.toBeNull();
		expect(result.success).toBe(true);
	});

	it("act('settings.set') persists changes", async function () {
		const original = await browser.executeObsidian(({ app }) => {
			const p = (
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							| { settings?: { diffContextLines?: number } }
							| undefined
						>;
					};
				}
			).plugins.plugins["quartz-syncer"];
			return p?.settings?.diffContextLines;
		});

		await browser.executeObsidian(async () => {
			if (!window.__QS__) return;
			await window.__QS__.act({
				name: "settings.set",
				params: { key: "diffContextLines", value: 5 },
			});
		});

		const updated = await browser.executeObsidian(({ app }) => {
			const p = (
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							| { settings?: { diffContextLines?: number } }
							| undefined
						>;
					};
				}
			).plugins.plugins["quartz-syncer"];
			return p?.settings?.diffContextLines;
		});
		expect(updated).toBe(5);

		await browser.executeObsidian(async (_, origValue: number) => {
			if (!window.__QS__) return;
			await window.__QS__.act({
				name: "settings.set",
				params: { key: "diffContextLines", value: origValue },
			});
		}, original);
	});

	it("survives plugin reload", async function () {
		await browser.executeObsidian(async ({ app }) => {
			await app.plugins.disablePlugin("quartz-syncer");
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await app.plugins.enablePlugin("quartz-syncer");
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const facadeType = await browser.executeObsidian(() => {
			return typeof window.__QS__;
		});
		expect(facadeType).toBe("object");

		const health = await browser.executeObsidian(() => {
			if (!window.__QS__) return null;
			return window.__QS__.assert("health.core");
		});
		expect(health).not.toBeNull();
		expect(health.pass).toBe(true);
	});
});
