import {
	Notice,
	Setting,
	type SettingDefinitionItem,
	type SettingGroup,
} from "obsidian";
import type QuartzSyncer from "main";
import type QuartzSyncerSettings from "src/models/settings";

type SettingsKey = keyof QuartzSyncerSettings;

export function performanceSettingDefinitions(
	plugin: QuartzSyncer,
): SettingDefinitionItem<SettingsKey>[] {
	return [
		{
			type: "group",
			heading: "Performance",
			items: [
				{
					name: "Enable caching",
					desc: "Enable or disable the Quartz Syncer cache. This can improve performance by storing compiled files locally.",
					control: {
						type: "toggle",
						key: "useCache",
						defaultValue: true,
					},
				},
				{
					name: "Cache settings",
					render: (setting: Setting, _group: SettingGroup) => {
						if (!plugin.settings.useCache) {
							setting.settingEl.addClass("quartz-syncer-hidden");

							return;
						}

						setting
							.setName("Synchronize cache between devices")
							.setDesc(
								"Whether to write the cache to `data.json`. This is useful for syncing the cache across devices.",
							)
							.addToggle((toggle) =>
								toggle
									.setValue(plugin.settings.syncCache)
									.onChange(async (value) => {
										plugin.settings.syncCache = value;
										await plugin.saveSettings();
									}),
							);
					},
				},
				{
					name: "Persist cache after unload",
					render: (setting: Setting, _group: SettingGroup) => {
						if (!plugin.settings.useCache) {
							setting.settingEl.addClass("quartz-syncer-hidden");

							return;
						}

						setting
							.setName("Persist cache after unload")
							.setDesc(
								"Whether to persist the cache when the plugin is unloaded. This is useful for users that start Obsidian with the plugin disabled.",
							)
							.addToggle((toggle) =>
								toggle
									.setValue(plugin.settings.persistCache)
									.onChange(async (value) => {
										plugin.settings.persistCache = value;
										await plugin.saveSettings();
									}),
							);
					},
				},
				{
					name: "Clear cache",
					render: (setting: Setting, _group: SettingGroup) => {
						if (!plugin.settings.useCache) {
							setting.settingEl.addClass("quartz-syncer-hidden");

							return;
						}

						setting
							.setName("Clear cache")
							.setDesc(
								"Clear the Quartz Syncer cache. This will remove all cached files and force a re-fetch of all data from the remote repository.",
							)
							.addButton((button) =>
								button
									.setButtonText("Clear cache")
									.setCta()
									.onClick(async () => {
										await plugin.datastore.dropAllFiles();
										plugin.settings.cache = "{}";
										await plugin.saveSettings();

										new Notice(
											"Quartz Syncer: cache cleared.",
										);
									}),
							);
					},
				},
			],
		},
	];
}
