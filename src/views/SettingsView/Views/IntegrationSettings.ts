import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import {
	integrationRegistry,
	PluginIntegration,
} from "src/compiler/integrations";
import QuartzSyncerSettings from "src/models/settings";

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

		const coreIntegrations = integrationRegistry.getByCategory("core");

		const communityIntegrations =
			integrationRegistry.getByCategory("community");

		if (coreIntegrations.length > 0) {
			this.initializeCorePluginHeader();

			for (const integration of coreIntegrations) {
				this.initializeIntegrationSetting(integration);
			}
		}

		if (communityIntegrations.length > 0) {
			this.initializeCommunityPluginHeader();

			for (const integration of communityIntegrations) {
				this.initializeIntegrationSetting(integration);
			}
		}

		this.initializeStylesHeader();
		this.initializeManageSyncerStylesSetting();

		this.settings.settings.lastUsedSettingsTab = "integration";
		this.settings.plugin.saveSettings();
	}

	private initializeCorePluginHeader() {
		new Setting(this.settingsRootElement)
			.setName("Core plugins")
			.setDesc("Integrations for Obsidian's built-in core plugins.")
			.setHeading();
	}

	private initializeCommunityPluginHeader() {
		new Setting(this.settingsRootElement)
			.setName("Community plugins")
			.setDesc("Integrations for third-party community plugins.")
			.setHeading();
	}

	private initializeIntegrationSetting(integration: PluginIntegration) {
		const isAvailable = integration.isAvailable();
		const settingKey = integration.settingKey as keyof QuartzSyncerSettings;
		const currentValue = this.settings.settings[settingKey] as boolean;

		new Setting(this.settingsRootElement)
			.setName(`Enable ${integration.name} integration`)
			.setDesc(this.getIntegrationDescription(integration.id))
			.addToggle((toggle) =>
				toggle
					.setValue(currentValue && isAvailable)
					.setDisabled(!isAvailable)
					.onChange(async (value) => {
						(this.settings.settings[settingKey] as boolean) =
							value && isAvailable;
						await this.settings.plugin.saveSettings();
					}),
			)
			.setClass(
				isAvailable
					? "quartz-syncer-settings-enabled"
					: "quartz-syncer-settings-disabled",
			);
	}

	private getIntegrationDescription(integrationId: string): string {
		const descriptions: Record<string, string> = {
			dataview:
				"Converts Dataview queries into Quartz-compatible markdown.",
			datacore:
				"Converts Datacore queries into Quartz-compatible markdown. Currently experimental.",
			excalidraw:
				"Converts Excalidraw drawings into Quartz-compatible format.",
			"fantasy-statblocks":
				"Converts Fantasy Statblocks queries into Quartz-compatible format.",
			"auto-card-link":
				"Converts Auto Card Link queries into Quartz-compatible markdown.",
			bases: "Publishes Obsidian Bases (.base files) to Quartz. Processing is delegated to Quartz.",
		};

		return (
			descriptions[integrationId] ??
			`Enables ${integrationId} integration.`
		);
	}

	private initializeStylesHeader() {
		new Setting(this.settingsRootElement)
			.setName("Integration styles")
			.setDesc(
				"Settings for managing integration styles in your Quartz project.",
			)
			.setHeading();
	}

	private initializeManageSyncerStylesSetting() {
		new Setting(this.settingsRootElement)
			.setName("Manage integration styles")
			.setDesc(
				"When enabled, Quartz Syncer will automatically write SCSS files for enabled integrations and ensure custom.scss imports them.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.manageSyncerStyles)
					.onChange(async (value) => {
						this.settings.settings.manageSyncerStyles = value;
						await this.settings.plugin.saveSettings();
					}),
			);
	}
}
