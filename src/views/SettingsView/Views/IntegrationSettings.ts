import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import { isPluginEnabled } from "obsidian-dataview";

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

	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializePluginIntegrationHeader();
		this.initializeDataviewSetting();
		this.initializeDatacoreSetting();
		this.initializeExcalidrawSetting();

		this.settings.settings.lastUsedSettingsTab = "integration";
		this.settings.saveSettings();
	}

	initializePluginIntegrationHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Plugin integration")
			.setDesc(
				"Quartz Syncer will use these Obsidian plugins with your Quartz notes.",
			)
			.setHeading();
	};

	private initializeDatacoreSetting() {
		//@ts-expect-error // Accessing global window object
		const datacoreEnabled = !!(window.datacore !== undefined);

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

	private initializeDataviewSetting() {
		const dataviewEnabled = isPluginEnabled(this.settings.app);

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
}
