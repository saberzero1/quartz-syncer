import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type QuartzSyncer from "src/main";
import type { DynamicOptionListState } from "src/views/settings/DynamicToggleSet";

/** Prefix for the synthetic per-file toggle keys read by QuartzSyncerSettingTab. */
export const CSS_SNIPPET_CONTROL_PREFIX = "cssSnippet::";

export function integrationSettingDefinitions(
	plugin: QuartzSyncer,
	cssSnippets: DynamicOptionListState,
): SettingDefinitionItem[] {
	return [
		{
			type: "group",
			heading: "Core plugins",
			items: [
				{
					name: "Enable Bases integration",
					desc: "Publishes Obsidian Bases (.base files) to Quartz.",
					control: {
						type: "toggle",
						key: "useBases",
						defaultValue: false,
					},
				},
				{
					name: "Enable Canvas integration",
					desc: "Publishes JSON Canvas (.canvas files) to Quartz.",
					control: {
						type: "toggle",
						key: "useCanvas",
						defaultValue: false,
					},
				},
				{
					name: "Enable Obsidian CSS Snippets integration",
					desc: "Publishes .css files from Obsidian's CSS Snippets folder to Quartz.",
					control: {
						type: "toggle",
						key: "useCssSnippets",
						defaultValue: false,
					},
				},
			],
		},
		{
			type: "group",
			heading: "Obsidian CSS Snippets",
			visible: () => plugin.settings.useCssSnippets,
			extraButtons: [
				(button) =>
					button
						.setIcon("refresh-cw")
						.setTooltip("Refresh snippet list")
						.onClick(() => cssSnippets.refresh()),
			],
			items: buildCssSnippetItems(cssSnippets),
		},
		{
			type: "group",
			heading: "Community plugins",
			items: [
				{
					name: "Enable Dataview integration",
					desc: "Converts Dataview queries into Quartz-compatible markdown.",
					control: {
						type: "toggle",
						key: "useDataview",
						defaultValue: true,
					},
				},
				{
					name: "Enable Datacore integration",
					desc: "Converts Datacore queries into Quartz-compatible markdown.",
					control: {
						type: "toggle",
						key: "useDatacore",
						defaultValue: false,
					},
				},
				{
					name: "Enable Excalidraw integration",
					desc: "Syncs Excalidraw drawings to Quartz.",
					control: {
						type: "toggle",
						key: "useExcalidraw",
						defaultValue: false,
					},
				},
				{
					name: "Enable Fantasy Statblocks integration",
					desc: "Converts Fantasy Statblocks queries into Quartz-compatible format.",
					control: {
						type: "toggle",
						key: "useFantasyStatblocks",
						defaultValue: false,
					},
				},
				{
					name: "Enable Auto Card Link integration",
					desc: "Converts Auto Card Link queries into Quartz-compatible markdown.",
					control: {
						type: "toggle",
						key: "useAutoCardLink",
						defaultValue: false,
					},
				},
			],
		},
		{
			type: "group",
			heading: "Integration styles",
			items: [
				{
					name: "Manage integration styles",
					desc: "Automatically write SCSS files for enabled integrations.",
					control: {
						type: "toggle",
						key: "manageSyncerStyles",
						defaultValue: true,
					},
				},
			],
		},
	];
}

function buildCssSnippetItems(
	cssSnippets: DynamicOptionListState,
): SettingGroupItem[] {
	if (cssSnippets.options === null) {
		return [
			{
				name: cssSnippets.loading
					? "Loading snippets…"
					: "Snippets not loaded yet.",
			},
		];
	}

	if (cssSnippets.options.length === 0) {
		return [
			{
				name: "No CSS snippets found",
				desc: "Add snippets in Obsidian's Appearance settings, then refresh.",
			},
		];
	}

	return cssSnippets.options.map((fileName) => ({
		name: fileName,
		control: {
			type: "toggle",
			key: `${CSS_SNIPPET_CONTROL_PREFIX}${fileName}`,
			defaultValue: false,
		},
	}));
}
