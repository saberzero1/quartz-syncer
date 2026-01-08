import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import type { DiffViewStyle } from "src/models/settings";

export class UISettings extends PluginSettingTab {
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

	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeUIHeader();
		this.initializeDiffViewStyleSetting();

		this.settings.settings.lastUsedSettingsTab = "ui";
		this.settings.plugin.saveSettings();
	}

	initializeUIHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("User Interface")
			.setDesc("Customize the appearance and behavior of Quartz Syncer.")
			.setHeading();
	};

	initializeDiffViewStyleSetting = () => {
		new Setting(this.settingsRootElement)
			.setName("Diff view style")
			.setDesc(
				"Choose how differences are displayed when comparing local and published files.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"auto",
						"Auto (Split on desktop, Unified on mobile)",
					)
					.addOption("split", "Always Split (side-by-side)")
					.addOption("unified", "Always Unified (single column)")
					.setValue(this.settings.settings.diffViewStyle)
					.onChange(async (value) => {
						this.settings.settings.diffViewStyle =
							value as DiffViewStyle;
						await this.settings.plugin.saveSettings();
					}),
			);
	};
}
