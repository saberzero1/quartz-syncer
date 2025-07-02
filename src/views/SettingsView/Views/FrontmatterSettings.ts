import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";

/**
 * FrontmatterSettings class.
 * This class is responsible for managing the frontmatter settings of the Quartz Syncer plugin.
 */
export class FrontmatterSettings extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		settings: SettingView,
		settingsRootElement: HTMLElement,
	) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
		this.plugin = plugin;
		this.settingsRootElement = settingsRootElement;
	}

	/**
	 * Display the frontmatter settings.
	 * This method initializes the settings UI for managing Quartz Syncer's frontmatter properties.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeFrontmatterHeader();
		this.initializePublishFrontmatterKeySetting();
		this.initializeAllNotesPublishableByDefaultSetting();
		this.initializeShowCreatedTimestampSetting();
		this.initializeCreatedTimestampKeysSetting();
		this.initializeShowUpdatedTimestampSetting();
		this.initializeUpdatedTimestampKeysSetting();
		this.initializeShowPublishedTimestampSetting();
		this.initializePublishedTimestampKeysSetting();
		this.initializeEnablePermalinkSetting();
		this.initializeIncludeAllFrontmatterSetting();

		// Set defaults for users that upgraded instead of freash install.
		if (this.settings.settings.createdTimestampKey === "") {
			this.settings.settings.createdTimestampKey =
				"created, created_at, date";
		}

		if (this.settings.settings.updatedTimestampKey === "") {
			this.settings.settings.updatedTimestampKey =
				"modified, lastmod, updated, last-modified";
		}

		if (this.settings.settings.publishedTimestampKey === "") {
			this.settings.settings.publishedTimestampKey =
				"published, publishDate, date";
		}

		this.settings.settings.lastUsedSettingsTab = "frontmatter";
		this.settings.plugin.saveSettings();
	}

	/**
	 * Initializes the header for the frontmatter settings section.
	 * This method creates a heading for the frontmatter settings in the UI.
	 */
	initializeFrontmatterHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Note properties (frontmatter)")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes' properties or frontmatter.",
			)
			.setHeading();
	};

	/**
	 * Initializes the setting for the publish frontmatter key.
	 * This method allows users to set the key used to mark notes as eligible for publication.
	 */
	private initializePublishFrontmatterKeySetting() {
		if (!this.settings.settings.allNotesPublishableByDefault) {
			new Setting(this.settingsRootElement)
				.setName("Publish key")
				.setDesc(
					'Note property key used to mark a note as eligible to publish. Quartz Syncer will ignore all notes without this property. By default "publish".',
				)
				.addText((text) =>
					text
						.setPlaceholder("publish")
						.setValue(this.settings.settings.publishFrontmatterKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value = "publish";
							}

							this.settings.settings.publishFrontmatterKey =
								value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to make all notes publishable by default.
	 * This method allows users to override the publish key setting and make all notes eligible for publication.
	 */
	private initializeAllNotesPublishableByDefaultSetting() {
		new Setting(this.settingsRootElement)
			.setName("All notes publishable by default")
			.setDesc(
				"Make all notes publishable by default. This will override the publish key setting and make all notes eligible for publication.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.allNotesPublishableByDefault,
					)
					.onChange(async (value) => {
						this.settings.settings.allNotesPublishableByDefault =
							value;
						await this.settings.plugin.saveSettings();
						this.display();
					}),
			);
	}

	/**
	 * Initializes the setting to include all frontmatter properties.
	 * This method allows users to include all note properties in the Quartz Syncer note,
	 * overriding other property settings.
	 */
	private initializeIncludeAllFrontmatterSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include all properties")
			.setDesc(
				"Include all note properties in the Quartz Syncer note. Enabling this will overrides other property settings to include all properties keys and values. Even note properties that are not used by Quartz will be included in the note's frontmatter. You shouldn't need this setting unless you have Quartz components that require non-standard properties.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.includeAllFrontmatter = value;
						await this.settings.plugin.saveSettings();
						this.display();
					}),
			);
	}

	/**
	 * Initializes the setting to show the created timestamp in the note's properties.
	 * This method allows users to include the created timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowCreatedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include created timestamp")
				.setDesc(
					"Include the created timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showCreatedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showCreatedTimestamp = value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the created timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the created timestamp.
	 */
	private initializeCreatedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showCreatedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Created timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the created timestamp. By default, Quartz Syncer will look for 'created', 'created_at', and 'date'.",
				)
				.addText((text) =>
					text
						.setPlaceholder("created, created_at, date")
						.setValue(this.settings.settings.createdTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.createdTimestampKey ===
									""
							) {
								value = "created, created_at, date";
							}

							this.settings.settings.createdTimestampKey = value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to show the updated timestamp in the note's properties.
	 * This method allows users to include the updated timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowUpdatedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include modified timestamp")
				.setDesc(
					"Include the modified timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showUpdatedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showUpdatedTimestamp = value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the updated timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the updated timestamp.
	 */
	private initializeUpdatedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showUpdatedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Modified timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the modified timestamp. By default, Quartz Syncer will look for 'modified', 'updated', and 'last_modified'.",
				)
				.addText((text) =>
					text
						.setPlaceholder(
							"modified, lastmod, updated, last-modified",
						)
						.setValue(this.settings.settings.updatedTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.updatedTimestampKey ===
									""
							) {
								value =
									"modified, lastmod, updated, last-modified";
							}

							this.settings.settings.updatedTimestampKey = value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to show the published timestamp in the note's properties.
	 * This method allows users to include the published timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowPublishedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include published timestamp")
				.setDesc(
					"Include the published timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showPublishedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showPublishedTimestamp =
								value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the published timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the published timestamp.
	 */
	private initializePublishedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showPublishedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Published timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the published timestamp. By default, Quartz Syncer will look for 'published', 'published_at', and 'date_published'.",
				)
				.addText((text) =>
					text
						.setPlaceholder("published, publishDate, date")
						.setValue(this.settings.settings.publishedTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.publishedTimestampKey ===
									""
							) {
								value = "published, publishDate, date";
							}

							this.settings.settings.publishedTimestampKey =
								value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to enable permalinks in the note's properties.
	 * This method allows users to use the note's permalink as the Quartz note's URL
	 * even if "permalink" is not in the frontmatter.
	 */
	private initializeEnablePermalinkSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable permalinks")
			.setDesc(
				"Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter. This will override the default Quartz URL.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.usePermalink)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.usePermalink = value;
						await this.settings.plugin.saveSettings();
					}),
			);
	}
}
