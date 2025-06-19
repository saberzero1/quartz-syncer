import { PluginSettingTab, App } from "obsidian";
import QuartzSyncer from "main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import SettingView from "src/views/SettingsView/SettingView";

/**
 * QuartzSyncerSettingTab class.
 * This class extends PluginSettingTab and is responsible for managing the settings tab
 * for the QuartzSyncer plugin. It initializes the settings and displays the setting view.
 */
export class QuartzSyncerSettingTab extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;

		if (!this.plugin.settings.noteSettingsIsInitialized) {
			const siteManager = new QuartzSyncerSiteManager(
				this.app.metadataCache,
				this.plugin.settings,
			);
			siteManager.updateEnv();
			this.plugin.settings.noteSettingsIsInitialized = true;
			this.plugin.saveSettings();
		}
	}

	/**
	 * Display the settings tab.
	 * This method initializes the SettingView and displays it in the container element.
	 */
	async display(): Promise<void> {
		const { containerEl } = this;

		const settingView = new SettingView(
			this.app,
			this.plugin,
			containerEl,
			this.plugin.settings,
			this.plugin.datastore,
		);

		await settingView.initialize();
	}
}
