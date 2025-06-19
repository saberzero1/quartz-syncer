import { Setting, App, PluginSettingTab, Notice } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";

/**
 * PerformanceSettings class.
 * This class is responsible for managing the performance settings of the Quartz Syncer plugin.
 */
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

	/**
	 * Displays the performance settings.
	 * This method initializes the performance settings UI and sets up event listeners.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializePerformanceHeader();
		this.initializeEnableCacheSetting();
		this.initializeSyncCacheSetting();
		this.initializePersistCacheSetting();
		this.initializeClearCacheSetting();

		this.settings.settings.lastUsedSettingsTab = "performance";
		this.settings.saveSettings();
	}

	/**
	 * Initializes the performance settings header.
	 * This method creates a header for the performance settings section.
	 */
	initializePerformanceHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Performance")
			.setDesc(
				"Quartz Syncer will use these settings to improve performance.",
			)
			.setHeading();
	};

	/**
	 * Initializes the enable cache setting.
	 * This method creates a toggle for enabling or disabling the Quartz Syncer cache.
	 */
	initializeEnableCacheSetting = () => {
		new Setting(this.settingsRootElement)
			.setName("Enable caching")
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
								"Quartz Syncer: Cache disabled. All cached data will be cleared.",
							);
						}

						this.display();
					}),
			);
	};

	/**
	 * Initializes the sync cache setting.
	 * This method creates a toggle for enabling or disabling the sync cache feature.
	 * The sync cache feature allows the cache to be written to `data.json` for syncing across devices.
	 */
	initializeSyncCacheSetting = () => {
		if (this.settings.settings.useCache) {
			new Setting(this.settingsRootElement)
				.setName("Synchronize cache between devices")
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

	/**
	 * Initializes the persist cache setting.
	 * This method creates a toggle for enabling or disabling the persistence of the cache.
	 * When enabled, the cache will not be removed when the plugin is unloaded
	 * This is useful for users that start Obsidian with the plugin disabled.
	 * For example, when using plugins that lazy-load Obsidian plugins.
	 * When disabled, the cache will be removed when the plugin is unloaded.
	 */
	initializePersistCacheSetting = () => {
		if (this.settings.settings.useCache) {
			new Setting(this.settingsRootElement)
				.setName("Persist cache after unload")
				.setDesc(
					"Whether to persist the cache when the plugin is unloaded. This is useful for users that start Obsidian with the plugin disabled.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.persistCache)
						.onChange((value) => {
							this.settings.settings.persistCache = value;
							this.settings.saveSettings();
						}),
				);
		}
	};

	/**
	 * Initializes the clear cache setting.
	 * This method creates a button for clearing the Quartz Syncer cache.
	 * When clicked, it will remove all cached files and force a re-fetch of all data from the GitHub repository.
	 */
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
							this.settings.settings.cache = "{}";
							this.settings.saveSettings();
							new Notice("Quartz Syncer: cache cleared.");
						}),
				);
		}
	};
}
