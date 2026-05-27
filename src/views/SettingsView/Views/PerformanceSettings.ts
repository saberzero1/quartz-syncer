import { Notice, type SettingDefinitionItem } from "obsidian";
import type QuartzSyncer from "main";

export function performanceSettingDefinitions(
	plugin: QuartzSyncer,
): SettingDefinitionItem[] {
	const settings = plugin.settings;

	return [
		{
			type: "group",
			heading: "Performance",
			items: [
				{
					name: "Enable caching",
					desc: "Enable or disable the Quartz Syncer cache. This can improve performance by storing compiled files locally.",
					aliases: ["speed", "local storage"],
					control: {
						type: "toggle",
						key: "useCache",
						defaultValue: true,
					},
				},
				{
					name: "Synchronize cache between devices",
					desc: "Whether to write the cache to `data.json`. This is useful for syncing the cache across devices.",
					aliases: ["sync", "data.json", "multi-device"],
					visible: () => settings.useCache,
					control: {
						type: "toggle",
						key: "syncCache",
						defaultValue: true,
					},
				},
				{
					name: "Persist cache after unload",
					desc: "Whether to persist the cache when the plugin is unloaded. This is useful for users that start Obsidian with the plugin disabled.",
					visible: () => settings.useCache,
					control: {
						type: "toggle",
						key: "persistCache",
						defaultValue: false,
					},
				},
				{
					name: "Clear cache",
					desc: "Clear the Quartz Syncer cache. This will remove all cached files and force a re-fetch of all data from the remote repository.",
					visible: () => settings.useCache,
					action: () => {
						void (async () => {
							await plugin.datastore.dropAllFiles();
							settings.cache = "{}";
							await plugin.saveSettings();
							new Notice("Quartz Syncer: cache cleared.");
						})();
					},
				},
			],
		},
	];
}
