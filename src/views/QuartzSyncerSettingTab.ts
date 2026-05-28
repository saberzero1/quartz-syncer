import {
	PluginSettingTab,
	App,
	Setting,
	type SettingDefinitionItem,
	type SettingGroup,
} from "obsidian";
import QuartzSyncer from "main";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import { GitSettingsPage } from "./SettingsView/Views/GitSettings";
import { QuartzV5Page } from "./SettingsView/Views/QuartzV5SettingsTab";
import { frontmatterSettingDefinitions } from "./SettingsView/Views/FrontmatterSettings";
import { integrationSettingDefinitions } from "./SettingsView/Views/IntegrationSettings";
import { performanceSettingDefinitions } from "./SettingsView/Views/PerformanceSettings";
import { uiSettingDefinitions } from "./SettingsView/Views/UISettings";

export class QuartzSyncerSettingTab extends PluginSettingTab {
	plugin: QuartzSyncer;

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.plugin = plugin;

		if (!this.plugin.settings.noteSettingsIsInitialized) {
			this.plugin.settings.noteSettingsIsInitialized = true;
			void this.plugin.saveSettings();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...this.buildOverviewItems(),
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
				items: integrationSettingDefinitions(),
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

	private buildOverviewItems(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		const version = this.plugin.manifest.version;

		return [
			{
				name: `Quartz Syncer v${version}`,
				desc: this.buildLinksFragment(),
			},
			{
				type: "group",
				heading: "Status",
				items: [
					{
						name: "Repository",
						desc: settings.gitRemoteUrl || "Not configured",
						visible: () => !!settings.gitRemoteUrl,
					},
					{
						name: "Branch",
						desc: settings.gitBranch || "Not configured",
						visible: () => !!settings.gitRemoteUrl,
					},
					{
						name: "Connection",
						render: (setting: Setting, _group: SettingGroup) => {
							this.renderConnectionStatus(setting);
						},
						visible: () => !!settings.gitRemoteUrl,
					},
					{
						name: "Quartz version",
						render: (setting: Setting, _group: SettingGroup) => {
							this.renderQuartzVersion(setting);
						},
						visible: () => !!settings.gitRemoteUrl,
					},
					{
						name: "Not configured",
						desc: "Set up your Git repository in the Git settings page to get started.",
						visible: () => !settings.gitRemoteUrl,
					},
				],
			},
		];
	}

	private buildLinksFragment(): DocumentFragment {
		const frag = createFragment();

		frag.createSpan({ text: "Publish your notes to " });

		frag.createEl("a", {
			text: "Quartz",
			href: "https://quartz.jzhao.xyz/",
		});

		frag.createSpan({ text: ". " });

		frag.createEl("a", {
			text: "Documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/",
		});

		frag.createSpan({ text: " · " });

		frag.createEl("a", {
			text: "Setup guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide",
		});

		frag.createSpan({ text: " · " });

		frag.createEl("a", {
			text: "Troubleshooting",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/",
		});

		return frag;
	}

	private renderConnectionStatus(setting: Setting): void {
		setting.setName("Connection").setDesc("Checking...");

		const gitSettings = this.plugin.getGitSettingsWithSecret();

		void (async () => {
			try {
				const { branches } =
					await RepositoryConnection.fetchRemoteBranches(
						gitSettings.remoteUrl,
						gitSettings.auth,
						gitSettings.corsProxyUrl,
					);

				const readOk = branches.length > 0;

				const writeOk = readOk
					? await RepositoryConnection.checkWriteAccess(
							gitSettings.remoteUrl,
							gitSettings.auth,
							gitSettings.corsProxyUrl,
						)
					: false;

				if (readOk && writeOk) {
					setting.setDesc("Connected (read & write)");
				} else if (readOk) {
					setting.setDesc("Connected (read only)");
				} else {
					setting.setDesc("Connection failed");
				}
			} catch {
				setting.setDesc("Connection failed");
			}
		})();
	}

	private renderQuartzVersion(setting: Setting): void {
		setting.setName("Quartz version").setDesc("Detecting...");

		const gitSettings = this.plugin.getGitSettingsWithSecret();

		void (async () => {
			try {
				const siteManager = new QuartzSyncerSiteManager(
					this.app.metadataCache,
					this.plugin.settings,
					gitSettings,
				);

				const version = await siteManager.getQuartzVersion();

				if (version === "v5-yaml" || version === "v5-json") {
					setting.setDesc(
						`Quartz v5 (${
							version === "v5-yaml" ? "YAML" : "JSON"
						} config)`,
					);
				} else {
					setting.setDesc("Quartz v4");
				}
			} catch {
				setting.setDesc("Could not detect version");
			}
		})();
	}
}
