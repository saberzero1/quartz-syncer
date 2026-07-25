import type { SettingDefinitionItem } from "obsidian";

export function integrationSettingDefinitions(): SettingDefinitionItem[] {
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
			],
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
