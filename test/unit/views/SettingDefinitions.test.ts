import { describe, expect, it, vi } from "vitest";
import {
	App,
	Setting,
	dropdownComponents,
	resetDropdownComponents,
	type SettingDefinitionItem,
} from "obsidian";
import { DEPRECATED_SETTING_KEYS } from "src/models/settings";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";
import { QuartzSyncerSettingTab } from "src/views/QuartzSyncerSettingTab";
import { frontmatterSettingDefinitions } from "src/views/settings/FrontmatterSettings";
import { integrationSettingDefinitions } from "src/views/settings/IntegrationSettings";
import { performanceSettingDefinitions } from "src/views/settings/PerformanceSettings";
import { uiSettingDefinitions } from "src/views/settings/UISettings";

function makePlugin(): QuartzSyncer {
	return {
		settings: { ...DEFAULT_SETTINGS },
		saveSettings: vi.fn().mockResolvedValue(undefined),
		manifest: { version: "0.0.0" },
		secretStorageService: {
			hasToken: vi.fn().mockReturnValue(false),
		},
	} as unknown as QuartzSyncer;
}

// Page factories are skipped: they render imperatively and need a live App.
// Only declarative `control` keys can bind a setting to a persisted key.
function collectControlKeys(items: SettingDefinitionItem[]): string[] {
	const keys: string[] = [];

	const walk = (nodes: SettingDefinitionItem[]): void => {
		for (const node of nodes) {
			const control = (node as { control?: { key?: string } }).control;

			if (control?.key) keys.push(control.key);

			const children = (node as { items?: SettingDefinitionItem[] })
				.items;

			if (children) walk(children);
		}
	};

	walk(items);

	return keys;
}

// The tab nests the same page definitions the direct calls below produce, so
// the keys are deduplicated to keep failure output readable.
function allControlKeys(): string[] {
	const plugin = makePlugin();

	return [
		...new Set([
			...collectControlKeys(
				new QuartzSyncerSettingTab(
					new App(),
					plugin,
				).getSettingDefinitions(),
			),
			...collectControlKeys(frontmatterSettingDefinitions(plugin)),
			...collectControlKeys(integrationSettingDefinitions()),
			...collectControlKeys(performanceSettingDefinitions(plugin)),
			...collectControlKeys(uiSettingDefinitions()),
		]),
	];
}

describe("setting definitions", () => {
	// Guards against the class of bug where a page exposes a toggle for a key
	// the v3 migration deletes, so the control silently does nothing.
	it("never exposes a control for a deprecated setting", () => {
		const exposed = allControlKeys().filter((key) =>
			DEPRECATED_SETTING_KEYS.includes(key),
		);

		expect(exposed).toEqual([]);
	});

	it("collects real keys, so the guard above cannot pass vacuously", () => {
		const keys = allControlKeys();

		expect(keys).toContain("useCache");
		expect(keys).toContain("autoCleanOrphanedMedia");
		// publishTarget is deliberately absent: its row renders imperatively so
		// the <select> can carry the DOM contract attribute. It has its own
		// behavioural coverage below.
		expect(keys).toContain("frontmatterFormat");
		expect(keys.length).toBeGreaterThan(10);
	});

	it("wires the imperative publish-target row to setControlValue", () => {
		const plugin = makePlugin();
		const tab = new QuartzSyncerSettingTab(new App(), plugin);
		const row = tab
			.getSettingDefinitions()
			.find((item) => item.name === "Publish to");

		const render = (
			row as { render?: (setting: unknown, group: unknown) => void }
		).render;

		expect(render).toBeTypeOf("function");

		resetDropdownComponents();
		render?.(new Setting(), {});

		const dropdown = dropdownComponents.at(-1);

		expect(dropdown?.options).toEqual({
			remote: "Remote repository",
			local: "Local folder (desktop only)",
		});
		expect(dropdown?.value).toBe(DEFAULT_SETTINGS.publishTarget);
		expect(dropdown?.selectEl.attributes).toMatchObject({
			"data-qs": "settings-input",
			"data-qs-field": "publish-target",
		});

		dropdown?.handler?.("local");

		expect(plugin.settings.publishTarget).toBe("local");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("binds every control to a known settings key", () => {
		const known = new Set(Object.keys(DEFAULT_SETTINGS));
		const unknown = allControlKeys().filter((key) => !known.has(key));

		expect(unknown).toEqual([]);
	});
});
