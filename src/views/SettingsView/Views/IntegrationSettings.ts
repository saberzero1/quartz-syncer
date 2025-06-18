import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import { isPluginEnabled } from "src/utils/utils";

/**
 * IntegrationSettings class.
 * This class is responsible for displaying and managing the integration settings for the Quartz Syncer plugin.
 */
export class IntegrationSettings extends PluginSettingTab {
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
	 * Displays the integration settings.
	 * This method initializes the settings UI elements and sets the last used settings tab.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializePluginIntegrationHeader();
		this.initializeDataviewSetting();
		this.initializeDatacoreSetting();
		this.initializeExcalidrawSetting();
		this.initializeFantasyStatblockSetting();

		this.settings.settings.lastUsedSettingsTab = "integration";
		this.settings.saveSettings();
	}

	/**
	 * Initializes the plugin integration header.
	 * This method creates a header for the plugin integration section in the settings.
	 */
	initializePluginIntegrationHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Plugin integration")
			.setDesc(
				"Quartz Syncer will use these Obsidian plugins with your Quartz notes.",
			)
			.setHeading();
	};

	/**
	 * Initializes the Datacore setting.
	 * This method creates a toggle for enabling/disabling Datacore integration.
	 * It checks if the Datacore plugin is enabled and updates the settings accordingly.
	 */
	private initializeDatacoreSetting() {
		const datacoreEnabled = isPluginEnabled("datacore");

		new Setting(this.settingsRootElement)
			.setName("Enable Datacore integration")
			.setDesc(
				"Converts Datacore queries into Quartz-compatible markdown. Currently, this is an experimental feature and may not work as expected.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.useDatacore && datacoreEnabled,
					)
					.setDisabled(!datacoreEnabled)
					.onChange(async (value) => {
						this.settings.settings.useDatacore =
							value && datacoreEnabled;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					datacoreEnabled
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled"
				}`,
			);
	}

	/**
	 * Initializes the Dataview setting.
	 * This method creates a toggle for enabling/disabling Dataview integration.
	 * It checks if the Dataview plugin is enabled and updates the settings accordingly.
	 */
	private initializeDataviewSetting() {
		const dataviewEnabled = isPluginEnabled("dataview");

		new Setting(this.settingsRootElement)
			.setName("Enable Dataview integration")
			.setDesc(
				"Converts Dataview queries into Quartz-compatible markdown.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.useDataview && dataviewEnabled,
					)
					.setDisabled(!dataviewEnabled)
					.onChange(async (value) => {
						this.settings.settings.useDataview =
							value && dataviewEnabled;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					dataviewEnabled
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled"
				}`,
			);
	}

	/**
	 * Initializes the Excalidraw setting.
	 * This method creates a toggle for enabling/disabling Excalidraw integration.
	 * It currently disables the toggle as Excalidraw integration is not yet implemented.
	 */
	private initializeExcalidrawSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable Excalidraw integration")
			.setDesc(
				"Converts Excalidraw drawings into Quartz-compatible format.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useExcalidraw)
					.setValue(false)
					.setDisabled(true)
					.onChange(async (value) => {
						this.settings.settings.useExcalidraw = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-upcoming");
	}

	/**
	 * Initializes the Fantasy Statblocks setting.
	 * This method creates a toggle for enabling/disabling Fantasy Statblocks integration.
	 * It checks if the Fantasy Statblocks plugin is enabled and updates the settings accordingly.
	 */
	private initializeFantasyStatblockSetting() {
		const fantasyStatblockEnabled = isPluginEnabled(
			"obsidian-5e-statblocks",
		);

		new Setting(this.settingsRootElement)
			.setName("Enable Fantasy Statblocks integration")
			.setDesc(
				"Converts Fantasy Statblocks queries into Quartz-compatible format.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.useFantasyStatblocks &&
							fantasyStatblockEnabled,
					)
					.setDisabled(!fantasyStatblockEnabled)
					.onChange(async (value) => {
						this.settings.settings.useFantasyStatblocks =
							value && fantasyStatblockEnabled;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					fantasyStatblockEnabled
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled"
				}`,
			);
	}
}
