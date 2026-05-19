import { PluginSettingTab, App, type SettingDefinitionItem } from "obsidian";
import QuartzSyncer from "main";
import QuartzSyncerSettings from "src/models/settings";
import { GitSettingsPage } from "./SettingsView/Views/GitSettings";
import { QuartzV5Page } from "./SettingsView/Views/QuartzV5SettingsTab";
import { frontmatterSettingDefinitions } from "./SettingsView/Views/FrontmatterSettings";
import { integrationSettingDefinitions } from "./SettingsView/Views/IntegrationSettings";
import { performanceSettingDefinitions } from "./SettingsView/Views/PerformanceSettings";
import { uiSettingDefinitions } from "./SettingsView/Views/UISettings";

type SettingsKey = keyof QuartzSyncerSettings;

export class QuartzSyncerSettingTab extends PluginSettingTab<QuartzSyncerSettings> {
	plugin: QuartzSyncer;

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin, plugin.settings);
		this.plugin = plugin;

		if (!this.plugin.settings.noteSettingsIsInitialized) {
			this.plugin.settings.noteSettingsIsInitialized = true;
			void this.plugin.saveSettings();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
		return [
			{
				type: "page",
				name: "Git",
				desc: "Configure your Git remote, authentication, and branch.",
				page: () => new GitSettingsPage(this.app, this.plugin),
			},
			{
				type: "page",
				name: "Quartz",
				desc: "Quartz site configuration, plugins, and templates.",
				page: () => new QuartzV5Page(this.app, this.plugin),
			},
			{
				type: "page",
				name: "Frontmatter",
				desc: "Note properties and frontmatter settings.",
				items: frontmatterSettingDefinitions(this.plugin),
			},
			{
				type: "page",
				name: "Integration",
				desc: "Plugin integrations for Dataview, Excalidraw, and more.",
				items: integrationSettingDefinitions(this.plugin),
			},
			{
				type: "page",
				name: "Performance",
				desc: "Caching and performance optimization.",
				items: performanceSettingDefinitions(this.plugin),
			},
			{
				type: "page",
				name: "UI",
				desc: "Customize the appearance and behavior of Quartz Syncer.",
				items: uiSettingDefinitions(),
			},
		];
	}
}
