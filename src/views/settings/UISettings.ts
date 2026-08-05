import type { SettingDefinitionItem } from "obsidian";

export function uiSettingDefinitions(): SettingDefinitionItem[] {
	return [
		{
			type: "group",
			heading: "User interface",
			items: [
				{
					name: "Diff view style",
					desc: "Choose how differences are displayed when comparing local and published files.",
					aliases: ["compare", "side-by-side", "preview"],
					control: {
						type: "dropdown",
						key: "diffViewStyle",
						defaultValue: "auto",
						options: {
							auto: "Auto (Split on desktop, Unified on mobile)",
							split: "Always Split (side-by-side)",
							unified: "Always Unified (single column)",
						},
					},
				},
			],
		},
		{
			type: "group",
			heading: "Publication center",
			items: [
				{
					name: "Allow custom file publishing",
					desc: "Enable selection of arbitrary vault files in the publication center.",
					aliases: ["arbitrary", "custom files"],
					control: {
						type: "toggle",
						key: "allowArbitraryFilePublishing",
						defaultValue: false,
					},
				},
			],
		},
	];
}
