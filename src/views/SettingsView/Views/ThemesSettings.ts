import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";

/**
 * ThemesSettings class.
 * This class is responsible for managing the settings related to Quartz themes in the QuartzSyncer plugin.
 */
export class ThemesSettings extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	settingsRootElement: HTMLElement;

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
		this.settingsRootElement.classList.add("settings-tab-content");
	}

	/**
	 * Display the settings for Quartz themes.
	 * This method initializes the settings UI for managing Quartz themes.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeThemesHeader();
		this.initializeThemeSetting();

		this.settings.settings.lastUsedSettingsTab = "themes";
		this.settings.saveSettings();
	}

	/**
	 * Unload the settings tab.
	 * This method is called when the settings tab is unloaded.
	 */
	initializeThemesHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Quartz Themes")
			.setDesc(
				"Quartz Themes is a project that aims to regularly convert Obsidian themes to a Quartz-compatible format. Quartz Syncer will install the chosen theme in Quartz from the Quartz Themes repository.",
			)
			.setHeading();
	};

	/**
	 * Initialize the theme setting.
	 * This method creates a toggle for enabling or disabling the use of themes in Quartz.
	 */
	initializeThemeSetting = () => {
		new Setting(this.settingsRootElement)
			.setName("Theme")
			.setDesc("Select the theme for your Quartz site.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useThemes)
					.setValue(false)
					.setDisabled(true)
					.onChange((value) => {
						this.settings.settings.useThemes = value;
						this.settings.saveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-upcoming");
	};
}
