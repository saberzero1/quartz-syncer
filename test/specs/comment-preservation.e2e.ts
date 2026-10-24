import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";
import type QuartzSyncer from "../../src/main";
import type { QuartzSyncerSettingTab } from "../../src/views/QuartzSyncerSettingTab";

const source =
	"---\npublish: true\n---\n\n%% tabs %%\n%% tab: First %%\nVisible content.\n%% tab: Second %%\n%% cols %%\n%% col %%\nLeft.\n%% col %%\nRight.\n%% endcols %%\n%% endtabs %%\n\n%% Private comment %%\n";
const notePath = "Comment preservation.md";

// wdio-obsidian-service opens a copied test vault, never an existing user vault.
describe("Comment preservation in local publication", function () {
	let destination: string;

	before(async function () {
		await browser.reloadObsidian({ vault: "test-vault" });
		destination = await mkdtemp(join(tmpdir(), "quartz-comment-native-"));
		await mkdir(join(destination, "content"));
		await writeFile(
			join(destination, "quartz.config.default.yaml"),
			"configuration:\n  pageTitle: Comment fixture\n",
		);
		await browser.executeObsidian(
			async ({ app }, text: string, path: string) => {
				await app.vault.create(path, text);
			},
			source,
			notePath,
		);
		for (let attempt = 0; attempt < 40; attempt++) {
			const ready = await browser.executeObsidian(
				({ app }, path: string) =>
					Boolean(app.metadataCache.getCache(path)?.frontmatter),
				notePath,
			);
			if (ready) return;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error("Fixture frontmatter did not reach the metadata cache");
	});

	after(async function () {
		await browser.executeObsidian(async ({ app }, path: string) => {
			const file = app.vault.getFileByPath(path);
			if (file) await app.vault.delete(file);
		}, notePath);
		await rm(destination, { recursive: true, force: true });
	});

	it("defaults to Remove and persists the declarative dropdown through reload", async function () {
		const state = await browser.executeObsidian(({ app }) => {
			const tab = app.setting.pluginTabs.find(
				(candidate) => candidate.id === "quartz-syncer",
			) as QuartzSyncerSettingTab | undefined;
			if (!tab) throw new Error("Quartz Syncer settings tab is missing");
			const definitions = JSON.stringify(tab.getSettingDefinitions());
			return {
				mode: tab.plugin.settings.obsidianCommentMode,
				definitions,
			};
		});
		expect(state.mode).toBe("remove");
		expect(state.definitions).toContain("obsidianCommentMode");
		expect(state.definitions).toContain("Preserve");
		expect(state.definitions).toContain("Remove");

		for (const mode of ["preserve", "remove"] as const) {
			await browser.executeObsidian(async ({ app }, value: string) => {
				const tab = app.setting.pluginTabs.find(
					(candidate) => candidate.id === "quartz-syncer",
				) as QuartzSyncerSettingTab | undefined;
				if (!tab)
					throw new Error("Quartz Syncer settings tab is missing");
				await tab.setControlValue("obsidianCommentMode", value);
				await app.plugins.disablePlugin("quartz-syncer");
				await app.plugins.enablePlugin("quartz-syncer");
			}, mode);
			const stored = await browser.executeObsidian(
				({ plugins }) =>
					(plugins.quartzSyncer as QuartzSyncer).settings
						.obsidianCommentMode,
			);
			expect(stored).toBe(mode);
		}
	});

	it("publishes Remove → Preserve → Remove without changing source or mtime", async function () {
		await browser.executeObsidian(async (_, path: string) => {
			if (!window.__QS__)
				throw new Error("Operability facade unavailable");
			for (const [key, value] of Object.entries({
				publishTarget: "local",
				quartzRepoPath: path,
				contentFolder: "content",
				gitRemoteUrl: "",
				vaultPath: "/",
				useDataview: false,
				autoPublishInterval: 0,
				autoCleanOrphanedMedia: false,
				syncCache: false,
			})) {
				const result = await window.__QS__.act({
					name: "settings.set",
					params: { key, value },
				});
				if (!result.success) throw new Error(result.error);
			}
		}, destination);
		const before = await browser.executeObsidian(
			async ({ app }, path: string) => {
				const file = app.vault.getFileByPath(path);
				if (!file) throw new Error("Fixture note missing");
				return {
					text: await app.vault.read(file),
					mtime: file.stat.mtime,
				};
			},
			notePath,
		);

		for (const mode of ["remove", "preserve", "remove"] as const) {
			const result = await browser.executeObsidian(
				async (_, value: string) => {
					if (!window.__QS__)
						throw new Error("Operability facade unavailable");
					const set = await window.__QS__.act({
						name: "settings.set",
						params: { key: "obsidianCommentMode", value },
					});
					if (!set.success) throw new Error(set.error);
					const refresh = await window.__QS__.act({
						name: "status.refresh",
					});
					if (!refresh.success) throw new Error(refresh.error);
					return window.__QS__.act({
						name: "pub.publish",
						params: { confirm: true, message: "Comment fixture" },
					});
				},
				mode,
			);
			expect(result.success).toBe(true);
			const output = await readFile(
				join(destination, "content", notePath),
				"utf8",
			);
			if (mode === "preserve") {
				for (const marker of [
					"%% tabs %%",
					"%% tab: First %%",
					"%% cols %%",
					"%% col %%",
					"%% endcols %%",
					"%% endtabs %%",
					"%% Private comment %%",
				])
					expect(output).toContain(marker);
			} else {
				expect(output).not.toContain("%%");
				expect(output).not.toContain("Private comment");
			}
			expect(output).toContain("Visible content.");
			const after = await browser.executeObsidian(
				async ({ app }, path: string) => {
					const file = app.vault.getFileByPath(path);
					if (!file) throw new Error("Fixture note missing");
					return {
						text: await app.vault.read(file),
						mtime: file.stat.mtime,
					};
				},
				notePath,
			);
			expect(after).toEqual(before);
		}
	});
});
