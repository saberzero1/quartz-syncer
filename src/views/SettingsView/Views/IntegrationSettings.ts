import {
	Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
	type SettingGroup,
} from "obsidian";
import type QuartzSyncer from "main";
import type QuartzSyncerSettings from "src/models/settings";
import {
	integrationRegistry,
	type PluginIntegration,
} from "src/compiler/integrations";

type SettingsKey = keyof QuartzSyncerSettings;

const integrationDescriptions: Record<string, string> = {
	dataview: "Converts Dataview queries into Quartz-compatible markdown.",
	datacore:
		"Converts Datacore queries into Quartz-compatible markdown. Currently experimental.",
	excalidraw: "Converts Excalidraw drawings into Quartz-compatible format.",
	"fantasy-statblocks":
		"Converts Fantasy Statblocks queries into Quartz-compatible format.",
	"auto-card-link":
		"Converts Auto Card Link queries into Quartz-compatible markdown.",
	bases: "Publishes Obsidian Bases (.base files) to Quartz. Processing is delegated to Quartz.",
	canvas: "Publishes JSON Canvas (.canvas files) to Quartz. Processing is delegated to Quartz.",
};

export function integrationSettingDefinitions(
	plugin: QuartzSyncer,
): SettingDefinitionItem<SettingsKey>[] {
	const items: SettingDefinitionItem<SettingsKey>[] = [];

	const coreIntegrations = integrationRegistry.getByCategory("core");

	const communityIntegrations =
		integrationRegistry.getByCategory("community");

	if (coreIntegrations.length > 0) {
		items.push({
			type: "group",
			heading: "Core plugins",
			items: coreIntegrations.map((i) => renderIntegration(plugin, i)),
		});
	}

	if (communityIntegrations.length > 0) {
		items.push({
			type: "group",
			heading: "Community plugins",
			items: communityIntegrations.map((i) =>
				renderIntegration(plugin, i),
			),
		});
	}

	items.push({
		type: "group",
		heading: "Integration styles",
		items: [
			{
				name: "Manage integration styles",
				desc: "When enabled, Quartz Syncer will automatically write SCSS files for enabled integrations and ensure custom.scss imports them.",
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

function renderIntegration(
	plugin: QuartzSyncer,
	integration: PluginIntegration,
): SettingDefinition<SettingsKey> {
	return {
		name: `Enable ${integration.name} integration`,
		render: (setting: Setting, _group: SettingGroup) => {
			const isAvailable = integration.isAvailable();
			const settingKey = integration.settingKey;
			const currentValue = plugin.settings[settingKey] as boolean;

			setting
				.setName(`Enable ${integration.name} integration`)
				.setDesc(
					integrationDescriptions[integration.id] ??
						`Enables ${integration.id} integration.`,
				)
				.addToggle((toggle) =>
					toggle
						.setValue(currentValue && isAvailable)
						.setDisabled(!isAvailable)
						.onChange(async (value) => {
							(plugin.settings[settingKey] as boolean) =
								value && isAvailable;
							await plugin.saveSettings();
						}),
				)
				.setClass(
					isAvailable
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled",
				);
		},
	};
}
