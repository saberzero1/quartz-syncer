import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { QuartzSyncerSettingTab } from "src/views/QuartzSyncerSettingTab";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";

function makeTab() {
	const saveSettings = vi.fn().mockResolvedValue(undefined);
	const saveData = vi.fn().mockResolvedValue(undefined);

	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		saveSettings,
		saveData,
	} as unknown as QuartzSyncer;

	const tab = new QuartzSyncerSettingTab({} as App, plugin);

	return { tab, plugin, saveSettings, saveData };
}

describe("QuartzSyncerSettingTab.setControlValue", () => {
	it("writes the value onto settings", async () => {
		const { tab, plugin } = makeTab();

		await tab.setControlValue("publishTarget", "local");

		expect(plugin.settings.publishTarget).toBe("local");
	});

	it("routes persistence through saveSettings so caches invalidate", async () => {
		const { tab, saveSettings, saveData } = makeTab();

		await tab.setControlValue("publishTarget", "local");

		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(saveData).not.toHaveBeenCalled();
	});

	it("persists after mutating, not before", async () => {
		const { tab, plugin, saveSettings } = makeTab();
		let targetAtSaveTime: unknown;
		saveSettings.mockImplementation(() => {
			targetAtSaveTime = plugin.settings.publishTarget;

			return Promise.resolve();
		});

		await tab.setControlValue("publishTarget", "local");

		expect(targetAtSaveTime).toBe("local");
	});

	it("works for any declarative key, not just publishTarget", async () => {
		const { tab, plugin, saveSettings } = makeTab();

		await tab.setControlValue("contentFolder", "docs");

		expect(plugin.settings.contentFolder).toBe("docs");
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});
});
