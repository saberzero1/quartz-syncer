import { browser, expect } from "@wdio/globals";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type QuartzSyncer from "../../src/main";
import type QuartzSyncerSettings from "../../src/models/settings";
import type { SettingDefinitionItem } from "obsidian";

/** Real Obsidian vault + compiler + local publishing backend; no network writes. */
describe("Excluded folders", function () {
	let destination: string;
	let savedSettings: QuartzSyncerSettings;

	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		destination = await mkdtemp(join(tmpdir(), "syncer-exclusions-"));
		savedSettings = await browser.executeObsidian(
			async ({ app }, output) => {
				const plugin = app.plugins.getPlugin(
					"quartz-syncer",
				) as QuartzSyncer;
				const previous = { ...plugin.settings };
				Object.assign(plugin.settings, {
					publishTarget: "local",
					quartzRepoPath: output,
					vaultPath: "/",
					excludedFolders: "Exclusion fixture/Private",
					allNotesPublishableByDefault: true,
					useCache: false,
					useDataview: false,
					useDatacore: false,
					manageSyncerStyles: false,
					autoPublishInterval: 0,
					autoCleanOrphanedMedia: false,
				});
				await plugin.saveSettings();
				await app.vault.createFolder("Exclusion fixture/Private");
				await app.vault.create(
					"Exclusion fixture/Private/journal.md",
					"---\npublish: true\n---\nPRIVATE FIXTURE",
				);
				await app.vault.create(
					"Exclusion fixture/public.md",
					"PUBLIC FIXTURE",
				);
				await app.vault.create(
					"Exclusion fixture/blocked.md",
					"![[Exclusion fixture/Private/journal]]",
				);
				return previous;
			},
			destination,
		);
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) =>
						!!app.metadataCache.getFirstLinkpathDest(
							"Exclusion fixture/Private/journal",
							"Exclusion fixture/blocked.md",
						),
				),
			{ timeout: 10000 },
		);
	});

	after(async function () {
		await browser.executeObsidian(async ({ app }, previous) => {
			await window.__QS__?.act({ name: "pub.close" });
			const folder = app.vault.getAbstractFileByPath("Exclusion fixture");
			if (folder) await app.vault.delete(folder, true);
			const plugin = app.plugins.getPlugin(
				"quartz-syncer",
			) as QuartzSyncer;
			plugin.settings = previous;
			await plugin.saveSettings();
		}, savedSettings);
		await rm(destination, { recursive: true, force: true });
	});

	it("loads cleanly and exposes the declarative exclusion setting", async function () {
		const result = await browser.executeObsidian(({ app }) => {
			const tab = app.setting.pluginTabs.find(
				(entry) => entry.id === "quartz-syncer",
			);
			const find = (items: SettingDefinitionItem[]): boolean =>
				items.some((item) => {
					if (
						"control" in item &&
						item.control?.key === "excludedFolders"
					)
						return true;
					return (
						"items" in item &&
						Array.isArray(item.items) &&
						find(item.items)
					);
				});
			return {
				healthy: window.__QS__?.assert("health.core").pass,
				setting: find(tab?.getSettingDefinitions() ?? []),
			};
		});
		expect(result).toEqual({ healthy: true, setting: true });
	});

	it("shows public candidates without an excluded journal in the publication center", async function () {
		await browser.executeObsidian(async () => {
			await window.__QS__?.act({ name: "pub.open" });
		});
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					() =>
						!!document.querySelector(
							'[data-qs="pub-row"][data-qs-path="Exclusion fixture/public.md"]',
						),
				),
			{ timeout: 10000 },
		);
		const privateVisible = await browser.executeObsidian(
			() =>
				!!document.querySelector(
					'[data-qs="pub-row"][data-qs-path="Exclusion fixture/Private/journal.md"]',
				),
		);
		expect(privateVisible).toBe(false);
		await browser.saveScreenshot(
			join(tmpdir(), "syncer-excluded-folders.png"),
		);
		await browser.executeObsidian(async () => {
			await window.__QS__?.act({ name: "pub.close" });
		});
	});

	it("writes nothing for a batch embedding a private note, then publishes allowed content", async function () {
		const blocked = await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.getPlugin(
				"quartz-syncer",
			) as QuartzSyncer;
			const publisher = plugin.getPublisher()!;
			const status = await publisher.getPublishStatus();
			const files = status.unpublished.filter((file) =>
				[
					"Exclusion fixture/public.md",
					"Exclusion fixture/blocked.md",
				].includes(file.getVaultPath()),
			);
			if (files.length !== 2) throw new Error("Missing publish fixtures");
			return { result: await publisher.publishBatch(files) };
		});
		expect(blocked.result.success).toBe(false);
		expect(blocked.result.error).toContain("excluded folder");
		expect(await readdir(destination)).toEqual([]);
		const allowed = await browser.executeObsidian(async ({ app }) => {
			const publisher = (
				app.plugins.getPlugin("quartz-syncer") as QuartzSyncer
			).getPublisher()!;
			const status = await publisher.getPublishStatus();
			return publisher.publishBatch(
				status.unpublished.filter(
					(file) =>
						file.getVaultPath() === "Exclusion fixture/public.md",
				),
			);
		});
		expect(allowed.success).toBe(true);
		expect(
			await readFile(
				join(destination, "content/Exclusion fixture/public.md"),
				"utf8",
			),
		).toContain("PUBLIC FIXTURE");
		expect(
			await readdir(join(destination, "content/Exclusion fixture")),
		).toEqual(["public.md"]);
	});
});
