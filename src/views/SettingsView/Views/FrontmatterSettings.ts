import type { SettingDefinition, SettingDefinitionItem } from "obsidian";
import type QuartzSyncer from "main";

/**
 * Validates a comma-separated list of frontmatter keys.
 * Each key must be non-empty and contain only word characters or hyphens.
 */
function validateTimestampKeys(value: string): string | undefined {
	const keys = value
		.split(",")
		.map((k) => k.trim())
		.filter((k) => k.length > 0);

	if (keys.length === 0) {
		return "At least one key is required.";
	}

	const invalid = keys.find((k) => !/^[\w-]+$/.test(k));

	if (invalid) {
		return `Invalid key "${invalid}". Keys may only contain letters, digits, underscores, and hyphens.`;
	}

	return undefined;
}

export function frontmatterSettingDefinitions(
	plugin: QuartzSyncer,
): SettingDefinitionItem[] {
	return [
		{
			type: "group",
			heading: "Note properties (frontmatter)",
			items: buildFrontmatterItems(plugin),
		},
	];
}

function buildFrontmatterItems(plugin: QuartzSyncer): SettingDefinition[] {
	const settings = plugin.settings;

	return [
		{
			name: "Frontmatter format",
			desc: "Output format for frontmatter in published notes. YAML is more readable, JSON is supported in case you need it.",
			aliases: ["yaml", "json", "properties"],
			control: {
				type: "dropdown",
				key: "frontmatterFormat",
				defaultValue: "yaml",
				options: {
					yaml: "YAML",
					json: "JSON",
				},
			},
		},
		{
			name: "Publish key",
			desc: 'Note property key used to mark a note as eligible to publish. By default "publish".',
			aliases: ["frontmatter", "property", "flag"],
			visible: () => !settings.allNotesPublishableByDefault,
			control: {
				type: "text",
				key: "publishFrontmatterKey",
				defaultValue: "publish",
				placeholder: "publish",
				validate: (value: string) =>
					value.trim().length === 0
						? "Publish key cannot be empty."
						: undefined,
			},
		},
		{
			name: "All notes publishable by default",
			desc: "Make all notes publishable by default. This will override the publish key setting.",
			aliases: ["public", "default publish"],
			control: {
				type: "toggle",
				key: "allNotesPublishableByDefault",
				defaultValue: false,
			},
		},
		{
			name: "Include all properties",
			desc: "Include all note properties in the Quartz Syncer note. Enabling this overrides other property settings.",
			control: {
				type: "toggle",
				key: "includeAllFrontmatter",
				defaultValue: false,
			},
		},
		{
			name: "Include created timestamp",
			desc: "Include the created timestamp in your note's properties.",
			visible: () => !settings.includeAllFrontmatter,
			control: {
				type: "toggle",
				key: "showCreatedTimestamp",
				defaultValue: true,
			},
		},
		{
			name: "Created timestamp keys",
			desc: "Comma-separated list of keys to look for to determine the created timestamp.",
			visible: () =>
				!settings.includeAllFrontmatter &&
				settings.showCreatedTimestamp,
			control: {
				type: "text",
				key: "createdTimestampKey",
				defaultValue: "created, created_at, date",
				placeholder: "created, created_at, date",
				validate: validateTimestampKeys,
			},
		},
		{
			name: "Include modified timestamp",
			desc: "Include the modified timestamp in your note's properties.",
			visible: () => !settings.includeAllFrontmatter,
			control: {
				type: "toggle",
				key: "showUpdatedTimestamp",
				defaultValue: true,
			},
		},
		{
			name: "Modified timestamp keys",
			desc: "Comma-separated list of keys to look for to determine the modified timestamp.",
			visible: () =>
				!settings.includeAllFrontmatter &&
				settings.showUpdatedTimestamp,
			control: {
				type: "text",
				key: "updatedTimestampKey",
				defaultValue: "modified, lastmod, updated, last-modified",
				placeholder: "modified, lastmod, updated, last-modified",
				validate: validateTimestampKeys,
			},
		},
		{
			name: "Include published timestamp",
			desc: "Include the published timestamp in your note's properties.",
			visible: () => !settings.includeAllFrontmatter,
			control: {
				type: "toggle",
				key: "showPublishedTimestamp",
				defaultValue: false,
			},
		},
		{
			name: "Published timestamp keys",
			desc: "Comma-separated list of keys to look for to determine the published timestamp.",
			visible: () =>
				!settings.includeAllFrontmatter &&
				settings.showPublishedTimestamp,
			control: {
				type: "text",
				key: "publishedTimestampKey",
				defaultValue: "published, publishDate, date",
				placeholder: "published, publishDate, date",
				validate: validateTimestampKeys,
			},
		},
		{
			name: "Enable permalinks",
			desc: "Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter.",
			aliases: ["slug", "url", "path"],
			control: {
				type: "toggle",
				key: "usePermalink",
				defaultValue: false,
			},
		},
	];
}
