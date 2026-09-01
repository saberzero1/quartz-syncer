import {
	Platform,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
import type QuartzSyncer from "src/main";
import type { DynamicOptionListState } from "src/views/settings/DynamicToggleSet";

/** Prefix for the synthetic per-folder toggle keys read by QuartzSyncerSettingTab. */
export const IGNORED_FOLDER_CONTROL_PREFIX = "ignoredFolder::";

/** Ignored-folders list also supports a top-level-only population action. */
export interface IgnoredFolderListState extends DynamicOptionListState {
	refreshTopLevel: () => void;
}

export function performanceSettingDefinitions(
	plugin: QuartzSyncer,
	ignoredFolders: IgnoredFolderListState,
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
		{
			type: "group",
			heading: "Ignored folders",
			extraButtons: [
				(button) =>
					button
						.setIcon("folder")
						.setTooltip("List top-level folders")
						.onClick(() => ignoredFolders.refreshTopLevel()),
				(button) =>
					button
						.setIcon("folder-tree")
						.setTooltip("List all folders (including subfolders)")
						.onClick(() => ignoredFolders.refresh()),
			],
			items: buildIgnoredFolderItems(ignoredFolders),
		},
	];
}

function buildIgnoredFolderItems(
	ignoredFolders: IgnoredFolderListState,
): SettingGroupItem[] {
	if (ignoredFolders.options === null) {
		return [
			{
				name: ignoredFolders.loading
					? "Loading folders…"
					: "Click a button above to list vault folders.",
			},
		];
	}

	if (ignoredFolders.options.length === 0) {
		return [
			{
				name: "No folders found",
				desc: "This vault has no subfolders to exclude.",
			},
		];
	}

	return ignoredFolders.options.map((folderPath) => ({
		name: folderPath,
		desc: "Excludes this folder (and its subfolders) from publish scanning and the Publication Center.",
		control: {
			type: "toggle",
			key: `${IGNORED_FOLDER_CONTROL_PREFIX}${folderPath}`,
			defaultValue: false,
		},
	}));
}
