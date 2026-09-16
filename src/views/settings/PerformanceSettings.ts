import { Platform, type SettingDefinitionItem } from "obsidian";
import type QuartzSyncer from "src/main";
import { CacheCleanupModal } from "src/views/CacheCleanupModal";

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
					name: "Clean up caches from other vaults",
					desc: "Remove cached data left behind by vaults you no longer use or remotes you no longer publish to. You will be asked to review the databases and confirm first.",
					action: () => {
						new CacheCleanupModal(plugin).open();
					},
				},
			],
		},
		{
			type: "group",
			heading: "Publishing",
			items: [
				{
					name: "Automatically clean orphaned media",
					desc: "When enabled, media files no longer linked by any published note are automatically deleted from the remote repository after publishing.",
					aliases: ["cleanup", "media", "orphaned"],
					control: {
						type: "toggle",
						key: "autoCleanOrphanedMedia",
						defaultValue: false,
					},
				},
			],
		},
		{
			type: "group",
			heading: "Background sync",
			items: [
				{
					name: "Remote fetch interval (seconds)",
					desc: "How often to fetch the remote repository state in the background. Lower values make the Publication Center open faster. Set to 0 to fetch on demand only.",
					aliases: ["fetch", "refresh", "remote", "git"],
					visible: () => settings.useCache,
					control: {
						type: "slider",
						key: "remoteFetchInterval",
						defaultValue: 60,
						min: 0,
						max: 300,
						step: 10,
					},
				},
			],
		},
		{
			type: "group",
			heading: "Auto-publish",
			visible: () => Platform.isDesktopApp,
			items: [
				{
					name: "Auto-publish interval (minutes)",
					desc: "Automatically publish pending changes on a timer. Set to 0 to disable. Desktop only.",
					aliases: ["timer", "automatic", "schedule"],
					control: {
						type: "slider",
						key: "autoPublishInterval",
						defaultValue: 0,
						min: 0,
						max: 120,
						step: 5,
					},
				},
			],
		},
	];
}
