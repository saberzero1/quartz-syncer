import {
	Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
	type SettingGroup,
} from "obsidian";
import type QuartzSyncer from "main";
import type QuartzSyncerSettings from "src/models/settings";

type SettingsKey = keyof QuartzSyncerSettings;

export function frontmatterSettingDefinitions(
	plugin: QuartzSyncer,
): SettingDefinitionItem<SettingsKey>[] {
	return [
		{
			type: "group",
			heading: "Note properties (frontmatter)",
			items: buildFrontmatterItems(plugin),
		},
	];
}

function buildFrontmatterItems(
	plugin: QuartzSyncer,
): SettingDefinition<SettingsKey>[] {
	const items: SettingDefinition<SettingsKey>[] = [];
	const settings = plugin.settings;

	items.push({
		name: "Frontmatter format",
		desc: "Output format for frontmatter in published notes. YAML is more readable, JSON is supported in case you need it.",
		control: {
			type: "dropdown",
			key: "frontmatterFormat",
			defaultValue: "yaml",
			options: {
				yaml: "YAML",
				json: "JSON",
			},
		},
	});

	items.push({
		name: "Publish key",
		render: (setting: Setting, _group: SettingGroup) => {
			if (settings.allNotesPublishableByDefault) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Publish key")
				.setDesc(
					'Note property key used to mark a note as eligible to publish. By default "publish".',
				)
				.addText((text) =>
					text
						.setPlaceholder("publish")
						.setValue(settings.publishFrontmatterKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value = "publish";
							}

							settings.publishFrontmatterKey = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "All notes publishable by default",
		desc: "Make all notes publishable by default. This will override the publish key setting.",
		control: {
			type: "toggle",
			key: "allNotesPublishableByDefault",
			defaultValue: false,
		},
	});

	items.push({
		name: "Include all properties",
		desc: "Include all note properties in the Quartz Syncer note. Enabling this overrides other property settings.",
		control: {
			type: "toggle",
			key: "includeAllFrontmatter",
			defaultValue: false,
		},
	});

	items.push({
		name: "Include created timestamp",
		render: (setting: Setting, _group: SettingGroup) => {
			if (settings.includeAllFrontmatter) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Include created timestamp")
				.setDesc(
					"Include the created timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.showCreatedTimestamp)
						.onChange(async (value) => {
							settings.showCreatedTimestamp = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Created timestamp keys",
		desc: "Comma-separated list of keys to look for to determine the created timestamp.",
		searchable: () =>
			!settings.includeAllFrontmatter && settings.showCreatedTimestamp,
		render: (setting: Setting, _group: SettingGroup) => {
			if (
				settings.includeAllFrontmatter ||
				!settings.showCreatedTimestamp
			) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Created timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the created timestamp.",
				)
				.addText((text) =>
					text
						.setPlaceholder("created, created_at, date")
						.setValue(settings.createdTimestampKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value = "created, created_at, date";
							}

							settings.createdTimestampKey = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Include modified timestamp",
		render: (setting: Setting, _group: SettingGroup) => {
			if (settings.includeAllFrontmatter) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Include modified timestamp")
				.setDesc(
					"Include the modified timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.showUpdatedTimestamp)
						.onChange(async (value) => {
							settings.showUpdatedTimestamp = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Modified timestamp keys",
		desc: "Comma-separated list of keys to look for to determine the modified timestamp.",
		searchable: () =>
			!settings.includeAllFrontmatter && settings.showUpdatedTimestamp,
		render: (setting: Setting, _group: SettingGroup) => {
			if (
				settings.includeAllFrontmatter ||
				!settings.showUpdatedTimestamp
			) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Modified timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the modified timestamp.",
				)
				.addText((text) =>
					text
						.setPlaceholder(
							"modified, lastmod, updated, last-modified",
						)
						.setValue(settings.updatedTimestampKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value =
									"modified, lastmod, updated, last-modified";
							}

							settings.updatedTimestampKey = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Include published timestamp",
		render: (setting: Setting, _group: SettingGroup) => {
			if (settings.includeAllFrontmatter) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Include published timestamp")
				.setDesc(
					"Include the published timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(settings.showPublishedTimestamp)
						.onChange(async (value) => {
							settings.showPublishedTimestamp = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Published timestamp keys",
		desc: "Comma-separated list of keys to look for to determine the published timestamp.",
		searchable: () =>
			!settings.includeAllFrontmatter && settings.showPublishedTimestamp,
		render: (setting: Setting, _group: SettingGroup) => {
			if (
				settings.includeAllFrontmatter ||
				!settings.showPublishedTimestamp
			) {
				setting.settingEl.addClass("quartz-syncer-hidden");

				return;
			}

			setting
				.setName("Published timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the published timestamp.",
				)
				.addText((text) =>
					text
						.setPlaceholder("published, publishDate, date")
						.setValue(settings.publishedTimestampKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value = "published, publishDate, date";
							}

							settings.publishedTimestampKey = value;
							await plugin.saveSettings();
						}),
				);
		},
	});

	items.push({
		name: "Enable permalinks",
		desc: "Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter.",
		control: {
			type: "toggle",
			key: "usePermalink",
			defaultValue: false,
		},
	});

	return items;
}
