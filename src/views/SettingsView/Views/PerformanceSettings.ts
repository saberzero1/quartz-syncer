import { Setting, App, PluginSettingTab, Notice } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";

export class PerformanceSettings extends PluginSettingTab {
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

		this.initializePerformanceHeader();
		this.initializeEnableCacheSetting();
		this.initializeSyncCacheSetting();
		this.initializeClearCacheSetting();

		this.settings.settings.lastUsedSettingsTab = "performance";
		this.settings.saveSettings();
	}

	initializePerformanceHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Performance")
			.setDesc(
				"Quartz Syncer will use these settings to improve performance.",
			)
			.setHeading();
	};

	initializeEnableCacheSetting = () => {
		new Setting(this.settingsRootElement)
			.setName("Cache")
			.setDesc(
				"Enable or disable the Quartz Syncer cache. This can improve performance by storing compiled files and reducing the number of requests made to the GitHub API.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useCache)
					.onChange((value) => {
						this.settings.settings.useCache = value;
						this.settings.saveSettings();

						if (!value) {
							// If cache is disabled, clear the cache
							this.plugin.datastore.persister.clear();

							new Notice(
								"Cache disabled. All cached data will be cleared.",
							);
						}

						this.display();
					}),
			);
	};

	initializeSyncCacheSetting = () => {
		if (this.settings.settings.useCache) {
			new Setting(this.settingsRootElement)
				.setName("Sync cache")
				.setDesc(
					"Whether to write the cache to `data.json`. This is useful for syncing the cache across devices. It is recommended to enable this setting if you are using Quartz Syncer on multiple devices.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.syncCache)
						.onChange((value) => {
							this.settings.settings.syncCache = value;
							this.settings.saveSettings();
						}),
				);
		}
	};

	initializeClearCacheSetting = () => {
		if (this.settings.settings.useCache) {
			new Setting(this.settingsRootElement)
				.setName("Clear cache")
				.setDesc(
					"Clear the Quartz Syncer cache. This will remove all cached files and force a re-fetch of all data from the GitHub repository.",
				)
				.addButton((button) =>
					button
						.setButtonText("Clear cache")
						.setCta()
						.onClick(async () => {
							// Drop all data from the datastore
							await this.plugin.datastore.dropAllFiles();
							new Notice("Quartz Syncer cache cleared.");
						}),
				);
		}
	};
}
