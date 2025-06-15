import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";

/**
 * QuartzSettings class.
 * This class is responsible for managing the Quartz-specific settings in the QuartzSyncer plugin.
 */
export class QuartzSettings extends PluginSettingTab {
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
		this.settingsRootElement = settingsRootElement;
	}

	/**
	 * Display the Quartz settings tab.
	 * This method initializes and displays the Quartz-specific settings in the plugin's settings view.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeQuartzHeader();
		this.initializeQuartzContentFolder();
		this.initializeUseFullImageResolutionSetting();
		this.initializeApplyEmbedsSetting();

		this.settings.settings.lastUsedSettingsTab = "quartz";
		this.settings.saveSettings();
	}

	/**
	 * Initializes the Quartz header in the settings view.
	 * This method creates a header for the Quartz settings section.
	 */
	initializeQuartzHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Quartz")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes.",
			)
			.setHeading();
	};

	/**
	 * Initializes the setting for using full image resolution.
	 * This method creates a toggle setting that allows users to choose whether to use full resolution images.
	 */
	private initializeUseFullImageResolutionSetting() {
		new Setting(this.settingsRootElement)
			.setName("Use full image resolution")
			.setDesc(
				"By default, Quartz Syncer will use lower resolution images to save space. If you want to use the full resolution blob, enable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useFullResolutionImages)
					.onChange(async (value) => {
						this.settings.settings.useFullResolutionImages = value;
						await this.settings.saveSettings();
					}),
			);
	}

	/**
	 * Initializes the setting for applying embeds.
	 * This method creates a toggle setting that allows users to choose whether to apply embeds directly to their notes.
	 */
	private initializeApplyEmbedsSetting() {
		new Setting(this.settingsRootElement)
			.setName("Apply embeds")
			.setDesc(
				"By default, Quartz Syncer will apply embeds directly to your notes. If you want to let Quartz handle embeds, disable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.applyEmbeds)
					.onChange(async (value) => {
						this.settings.settings.applyEmbeds = value;
						await this.settings.saveSettings();
					}),
			);
	}

	/**
	 * Initializes the Quartz content folder setting.
	 * This method creates a text input for the content folder where Quartz Syncer should store notes.
	 */
	private initializeQuartzContentFolder() {
		new Setting(this.settingsRootElement)
			.setName("Content folder")
			.setDesc(
				'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content"',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.settings.settings.contentFolder)
					.onChange(async (value) => {
						this.settings.settings.contentFolder = value;
						await this.settings.saveSettings();
					}),
			);
	}
}
