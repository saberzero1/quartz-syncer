import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import type {
	QuartzV5Config,
	QuartzLockFile,
	QuartzPluginEntry,
	QuartzVersion,
	QuartzLockFileEntry,
} from "src/quartz/QuartzConfigTypes";
import {
	getPluginName,
	getPluginSourceKey,
} from "src/quartz/QuartzPluginUtils";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import Logger from "js-logger";

const logger = Logger.get("quartz-v5-settings");

/**
 * Read-only Quartz v5 settings tab. Only shown when a v5 repository is detected.
 * Displays version info, site configuration, and the plugin list with lock file status.
 */
export class QuartzV5SettingsTab extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	private siteManager: QuartzSyncerSiteManager | null = null;
	private cachedConfig: QuartzV5Config | null = null;
	private cachedLockFile: QuartzLockFile | null = null;
	private cachedVersion: QuartzVersion | null = null;
	private cachedPackageVersion: string | null = null;
	private isLoading = false;

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

		this.settings.settings.lastUsedSettingsTab = "quartz v5";
		this.settings.plugin.saveSettings();

		if (this.cachedConfig) {
			this.renderContent();
		} else {
			this.renderLoading();
			this.loadV5Data();
		}
	}

	private renderLoading(): void {
		new Setting(this.settingsRootElement)
			.setName("Quartz v5 Configuration")
			.setDesc("Loading configuration from repository...")
			.setHeading();
	}

	private renderError(message: string): void {
		this.settingsRootElement.empty();

		new Setting(this.settingsRootElement)
			.setName("Quartz v5 Configuration")
			.setDesc("Could not load configuration.")
			.setHeading();

		new Setting(this.settingsRootElement)
			.setName("Error")
			.setDesc(message)
			.addButton((button) =>
				button.setButtonText("Retry").onClick(() => {
					this.cachedConfig = null;
					this.cachedLockFile = null;
					this.siteManager = null;
					this.display();
				}),
			);
	}

	private async loadV5Data(): Promise<void> {
		if (this.isLoading) return;
		this.isLoading = true;

		try {
			const siteManager = this.getOrCreateSiteManager();

			const version = await siteManager.getQuartzVersion();
			this.cachedVersion = version;

			if (version !== "v5-yaml" && version !== "v5-json") {
				this.renderError(
					`Expected Quartz v5 but detected: ${version}. Check your repository configuration.`,
				);
				this.isLoading = false;

				return;
			}

			const configService = await siteManager.getConfigService();

			if (!configService) {
				this.renderError(
					"Could not initialize config service for this repository.",
				);
				this.isLoading = false;

				return;
			}

			const [config, lockFile, packageVersion] = await Promise.all([
				configService.readConfig(),
				configService.readLockFile(),
				this.loadPackageVersion(siteManager),
			]);

			this.cachedConfig = config;
			this.cachedLockFile = lockFile;
			this.cachedPackageVersion = packageVersion;

			this.settingsRootElement.empty();
			this.renderContent();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to load Quartz v5 config", error);
			this.renderError(message);
		} finally {
			this.isLoading = false;
		}
	}

	private async loadPackageVersion(
		siteManager: QuartzSyncerSiteManager,
	): Promise<string | null> {
		try {
			return await QuartzVersionDetector.getQuartzPackageVersion(
				siteManager.userSyncerConnection,
			);
		} catch {
			return null;
		}
	}

	private getOrCreateSiteManager(): QuartzSyncerSiteManager {
		if (!this.siteManager) {
			this.siteManager = new QuartzSyncerSiteManager(
				this.app.metadataCache,
				this.settings.settings,
				this.plugin.getGitSettingsWithSecret(),
			);
		}

		return this.siteManager;
	}

	private renderContent(): void {
		this.renderVersionSection();
		this.renderSiteConfigSection();
		this.renderPluginListSection();
	}

	private renderVersionSection(): void {
		new Setting(this.settingsRootElement)
			.setName("Quartz v5 Configuration")
			.setDesc("Read-only view of your Quartz v5 repository settings.")
			.setHeading();

		const versionLabel = this.cachedPackageVersion
			? `${this.cachedPackageVersion} (${this.cachedVersion})`
			: (this.cachedVersion ?? "unknown");

		new Setting(this.settingsRootElement)
			.setName("Quartz version")
			.setDesc(versionLabel);

		const configFormat = this.cachedVersion === "v5-yaml" ? "YAML" : "JSON";

		new Setting(this.settingsRootElement)
			.setName("Configuration format")
			.setDesc(configFormat);

		new Setting(this.settingsRootElement).addButton((button) =>
			button.setButtonText("Refresh").onClick(() => {
				this.cachedConfig = null;
				this.cachedLockFile = null;
				this.cachedVersion = null;
				this.cachedPackageVersion = null;
				this.siteManager = null;
				this.display();
			}),
		);
	}

	private renderSiteConfigSection(): void {
		if (!this.cachedConfig) return;

		const config = this.cachedConfig.configuration;

		new Setting(this.settingsRootElement)
			.setName("Site Configuration")
			.setDesc(
				"Settings from the configuration section of your Quartz config file.",
			)
			.setHeading();

		new Setting(this.settingsRootElement)
			.setName("Page title")
			.setDesc(config.pageTitle);

		if (config.pageTitleSuffix !== undefined) {
			new Setting(this.settingsRootElement)
				.setName("Page title suffix")
				.setDesc(config.pageTitleSuffix);
		}

		new Setting(this.settingsRootElement)
			.setName("SPA mode")
			.setDesc(config.enableSPA ? "Enabled" : "Disabled");

		if (config.enablePopovers !== undefined) {
			new Setting(this.settingsRootElement)
				.setName("Popovers")
				.setDesc(config.enablePopovers ? "Enabled" : "Disabled");
		}

		new Setting(this.settingsRootElement)
			.setName("Locale")
			.setDesc(config.locale);

		if (config.baseUrl) {
			new Setting(this.settingsRootElement)
				.setName("Base URL")
				.setDesc(config.baseUrl);
		}

		if (config.analytics) {
			new Setting(this.settingsRootElement)
				.setName("Analytics provider")
				.setDesc(config.analytics.provider);
		}

		if (config.ignorePatterns && config.ignorePatterns.length > 0) {
			new Setting(this.settingsRootElement)
				.setName("Ignore patterns")
				.setDesc(config.ignorePatterns.join(", "));
		}

		if (config.theme) {
			const { typography, fontOrigin } = config.theme;

			new Setting(this.settingsRootElement)
				.setName("Typography")
				.setDesc(
					`Header: ${typography.header}, Body: ${typography.body}, Code: ${typography.code} (${fontOrigin})`,
				);
		}
	}

	private renderPluginListSection(): void {
		if (!this.cachedConfig) return;

		const plugins = this.cachedConfig.plugins;
		const lockPlugins = this.cachedLockFile?.plugins ?? {};

		new Setting(this.settingsRootElement)
			.setName("Plugins")
			.setDesc(`${plugins.length} plugin(s) configured.`)
			.setHeading();

		if (plugins.length === 0) {
			new Setting(this.settingsRootElement)
				.setName("No plugins")
				.setDesc("No plugins are configured in your Quartz config.");

			return;
		}

		for (const plugin of plugins) {
			this.renderPluginEntry(plugin, lockPlugins);
		}
	}

	private renderPluginEntry(
		plugin: QuartzPluginEntry,
		lockPlugins: Record<string, QuartzLockFileEntry>,
	): void {
		const name = getPluginName(plugin.source);
		const statusParts: string[] = [];

		statusParts.push(plugin.enabled ? "Enabled" : "Disabled");

		if (plugin.order !== undefined) {
			statusParts.push(`Order: ${plugin.order}`);
		}

		if (plugin.layout?.position) {
			statusParts.push(`Position: ${plugin.layout.position}`);
		}

		const key = getPluginSourceKey(plugin.source);
		const lockEntry = lockPlugins[key];

		if (lockEntry?.commit) {
			statusParts.push(`Commit: ${lockEntry.commit.slice(0, 7)}`);
		}

		new Setting(this.settingsRootElement)
			.setName(name)
			.setDesc(statusParts.join(" · "));
	}
}
