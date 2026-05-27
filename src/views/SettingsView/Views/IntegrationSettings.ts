import type { SettingDefinition, SettingDefinitionItem } from "obsidian";
import {
	integrationRegistry,
	type PluginIntegration,
} from "src/compiler/integrations";

const integrationDescriptions: Record<string, string> = {
	dataview: "Converts Dataview queries into Quartz-compatible markdown.",
	datacore:
		"Converts Datacore queries into Quartz-compatible markdown. Currently experimental.",
	excalidraw:
		"Syncs Excalidraw drawings to Quartz. Rendering is handled by the Quartz Excalidraw plugin.",
	"fantasy-statblocks":
		"Converts Fantasy Statblocks queries into Quartz-compatible format.",
	"auto-card-link":
		"Converts Auto Card Link queries into Quartz-compatible markdown.",
	bases: "Publishes Obsidian Bases (.base files) to Quartz. Processing is delegated to Quartz.",
	canvas: "Publishes JSON Canvas (.canvas files) to Quartz. Processing is delegated to Quartz.",
};

export function integrationSettingDefinitions(): SettingDefinitionItem[] {
	const items: SettingDefinitionItem[] = [];

	const coreIntegrations = integrationRegistry.getByCategory("core");

	const communityIntegrations =
		integrationRegistry.getByCategory("community");

	if (coreIntegrations.length > 0) {
		items.push({
			type: "group",
			heading: "Core plugins",
			items: coreIntegrations.map((i) => integrationDefinition(i)),
		});
	}

	if (communityIntegrations.length > 0) {
		items.push({
			type: "group",
			heading: "Community plugins",
			items: communityIntegrations.map((i) => integrationDefinition(i)),
		});
	}

	items.push({
		type: "group",
		heading: "Integration styles",
		items: [
			{
				name: "Manage integration styles",
				desc: "When enabled, Quartz Syncer will automatically write SCSS files for enabled integrations and ensure custom.scss imports them.",
				aliases: ["scss", "css", "custom.scss"],
				control: {
					type: "toggle",
					key: "manageSyncerStyles",
					defaultValue: true,
				},
			},
		],
	});

	return items;
}

function integrationDefinition(
	integration: PluginIntegration,
): SettingDefinition {
	const settingKey = integration.settingKey as string;

	return {
		name: `Enable ${integration.name} integration`,
		desc:
			integrationDescriptions[integration.id] ??
			`Enables ${integration.id} integration.`,
		control: {
			type: "toggle",
			key: settingKey,
			defaultValue: false,
			disabled: () => !integration.isAvailable(),
		},
	};
}
