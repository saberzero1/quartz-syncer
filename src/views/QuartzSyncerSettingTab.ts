import { PluginSettingTab, App } from "obsidian";
import QuartzSyncer from "main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import SettingView from "src/views/SettingsView/SettingView";

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
			this.plugin.saveData(this.plugin.settings);
		}
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		const settingView = new SettingView(
			this.app,
			this.plugin,
			containerEl,
			this.plugin.settings,
			async () => await this.plugin.saveData(this.plugin.settings),
		);

		await settingView.initialize();
	}
}
