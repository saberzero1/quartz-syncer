import { Setting, App, PluginSettingTab, Notice } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import type { QuartzConfigService } from "src/quartz/QuartzConfigService";
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
import {
	QuartzPluginUpdateChecker,
	type PluginUpdateStatus,
} from "src/quartz/QuartzPluginUpdateChecker";
import {
	QuartzUpgradeService,
	type QuartzUpgradeStatus,
} from "src/quartz/QuartzUpgradeService";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import Logger from "js-logger";

const logger = Logger.get("quartz-v5-settings");

/**
 * Quartz v5 settings tab with editable site configuration.
 * Only shown when a v5 repository is detected.
 * Displays version info, editable site config fields, and the plugin list.
 * Changes are committed and pushed to the repository on save.
 */
export class QuartzV5SettingsTab extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	private siteManager: QuartzSyncerSiteManager | null = null;
	private configService: QuartzConfigService | null = null;
	private cachedConfig: QuartzV5Config | null = null;
	private cachedLockFile: QuartzLockFile | null = null;
	private cachedVersion: QuartzVersion | null = null;
	private cachedPackageVersion: string | null = null;
	private cachedUpdateStatuses: Map<string, PluginUpdateStatus> | null = null;
	private cachedUpgradeStatus: QuartzUpgradeStatus | null = null;
	private isLoading = false;
	private isSaving = false;
	private isCheckingUpdates = false;
	private isCheckingUpgrade = false;
	private hasUnsavedChanges = false;

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
					this.resetCache();
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

			this.configService = await siteManager.getConfigService();

			if (!this.configService) {
				this.renderError(
					"Could not initialize config service for this repository.",
				);
				this.isLoading = false;

				return;
			}

			const [config, lockFile, packageVersion] = await Promise.all([
				this.configService.readConfig(),
				this.configService.readLockFile(),
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

	private resetCache(): void {
		this.cachedConfig = null;
		this.cachedLockFile = null;
		this.cachedVersion = null;
		this.cachedPackageVersion = null;
		this.cachedUpdateStatuses = null;
		this.cachedUpgradeStatus = null;
		this.configService = null;
		this.siteManager = null;
		this.hasUnsavedChanges = false;
	}

	private markDirty(): void {
		this.hasUnsavedChanges = true;
	}

	private async saveConfig(): Promise<void> {
		if (!this.cachedConfig || !this.configService || this.isSaving) return;

		this.isSaving = true;

		try {
			await this.configService.writeConfig(this.cachedConfig);
			this.hasUnsavedChanges = false;
			new Notice("Quartz configuration saved and pushed.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to save Quartz config", error);
			new Notice(`Failed to save configuration: ${message}`);
		} finally {
			this.isSaving = false;
		}
	}

	private renderContent(): void {
		this.renderVersionSection();
		this.renderUpgradeSection();
		this.renderSiteConfigSection();
		this.renderPluginListSection();
	}

	private renderVersionSection(): void {
		new Setting(this.settingsRootElement)
			.setName("Quartz v5 Configuration")
			.setDesc(
				"Edit your Quartz v5 site configuration. Changes are pushed to your repository on save.",
			)
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

		new Setting(this.settingsRootElement)
			.addButton((button) =>
				button.setButtonText("Save").onClick(async () => {
					await this.saveConfig();
				}),
			)
			.addButton((button) =>
				button.setButtonText("Refresh").onClick(() => {
					this.resetCache();
					this.display();
				}),
			);
	}

	private renderUpgradeSection(): void {
		const upgradeSetting = new Setting(this.settingsRootElement)
			.setName("Quartz Updates")
			.setHeading();

		upgradeSetting.addButton((button) =>
			button
				.setButtonText(
					this.isCheckingUpgrade
						? "Checking..."
						: "Check for Quartz updates",
				)
				.setDisabled(this.isCheckingUpgrade)
				.onClick(async () => {
					await this.checkForQuartzUpgrade();
				}),
		);

		if (this.cachedUpgradeStatus) {
			const status = this.cachedUpgradeStatus;

			if (status.error) {
				new Setting(this.settingsRootElement)
					.setName("Upgrade check failed")
					.setDesc(status.error);
			} else if (status.hasUpgrade) {
				const currentShort =
					status.currentCommit?.slice(0, 7) ?? "unknown";
				const upstreamShort =
					status.upstreamCommit?.slice(0, 7) ?? "unknown";

				new Setting(this.settingsRootElement)
					.setName("Quartz update available")
					.setDesc(
						`Your Quartz is at ${currentShort}, upstream is at ${upstreamShort}. ` +
							"Run `npx quartz update` in your repository to upgrade.",
					);
			} else {
				new Setting(this.settingsRootElement)
					.setName("Quartz is up to date")
					.setDesc(
						`Current commit: ${status.currentCommit?.slice(0, 7) ?? "unknown"}`,
					);
			}
		}
	}

	private async checkForQuartzUpgrade(): Promise<void> {
		if (this.isCheckingUpgrade) return;

		this.isCheckingUpgrade = true;

		try {
			const siteManager = this.getOrCreateSiteManager();
			const gitSettings = this.plugin.getGitSettingsWithSecret();

			const upgradeService = new QuartzUpgradeService(
				siteManager.userSyncerConnection,
				gitSettings.auth,
				RepositoryConnection.fetchRemoteHeadCommit,
				gitSettings.corsProxyUrl,
			);

			this.cachedUpgradeStatus = await upgradeService.checkForUpgrade();

			if (this.cachedUpgradeStatus.hasUpgrade) {
				new Notice(
					"A Quartz update is available. Run `npx quartz update` to upgrade.",
				);
			} else if (!this.cachedUpgradeStatus.error) {
				new Notice("Quartz is up to date.");
			} else {
				new Notice(
					`Upgrade check failed: ${this.cachedUpgradeStatus.error}`,
				);
			}

			this.settingsRootElement.empty();
			this.renderContent();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to check for Quartz upgrade", error);
			new Notice(`Failed to check for Quartz upgrade: ${message}`);
		} finally {
			this.isCheckingUpgrade = false;
		}
	}

	private renderSiteConfigSection(): void {
		if (!this.cachedConfig) return;

		const config = this.cachedConfig.configuration;

		new Setting(this.settingsRootElement)
			.setName("Site Configuration")
			.setDesc(
				"Edit site settings. Changes are applied when you click Save above.",
			)
			.setHeading();

		new Setting(this.settingsRootElement)
			.setName("Page title")
			.setDesc("The title shown in the browser tab and site header.")
			.addText((text) =>
				text.setValue(config.pageTitle).onChange((value) => {
					config.pageTitle = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("Page title suffix")
			.setDesc(
				'Appended to the page title on subpages (e.g. " | My Site").',
			)
			.addText((text) =>
				text
					.setValue(config.pageTitleSuffix ?? "")
					.onChange((value) => {
						config.pageTitleSuffix = value || undefined;
						this.markDirty();
					}),
			);

		new Setting(this.settingsRootElement)
			.setName("SPA mode")
			.setDesc(
				"Single Page Application mode for faster navigation between pages.",
			)
			.addToggle((toggle) =>
				toggle.setValue(config.enableSPA).onChange((value) => {
					config.enableSPA = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("Popovers")
			.setDesc("Show page preview popovers on hover.")
			.addToggle((toggle) =>
				toggle
					.setValue(config.enablePopovers ?? false)
					.onChange((value) => {
						config.enablePopovers = value;
						this.markDirty();
					}),
			);

		new Setting(this.settingsRootElement)
			.setName("Locale")
			.setDesc(
				"BCP 47 locale tag for date formatting and i18n (e.g. en-US).",
			)
			.addText((text) =>
				text.setValue(config.locale).onChange((value) => {
					config.locale = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("Base URL")
			.setDesc(
				"The base URL where your site is hosted (without protocol, e.g. example.com/quartz).",
			)
			.addText((text) =>
				text
					.setPlaceholder("example.com")
					.setValue(config.baseUrl ?? "")
					.onChange((value) => {
						config.baseUrl = value || undefined;
						this.markDirty();
					}),
			);

		if (config.analytics) {
			new Setting(this.settingsRootElement)
				.setName("Analytics provider")
				.setDesc(config.analytics.provider);
		}

		new Setting(this.settingsRootElement)
			.setName("Ignore patterns")
			.setDesc(
				"Comma-separated glob patterns for files to exclude from processing.",
			)
			.addText((text) =>
				text
					.setPlaceholder("drafts/*, private/*")
					.setValue((config.ignorePatterns ?? []).join(", "))
					.onChange((value) => {
						config.ignorePatterns = value
							.split(",")
							.map((p) => p.trim())
							.filter((p) => p.length > 0);
						this.markDirty();
					}),
			);

		if (config.theme) {
			this.renderThemeSection(config);
		}
	}

	private renderThemeSection(config: QuartzV5Config["configuration"]): void {
		const theme = config.theme;

		new Setting(this.settingsRootElement)
			.setName("Theme")
			.setDesc("Typography and font settings.")
			.setHeading();

		new Setting(this.settingsRootElement)
			.setName("Header font")
			.addText((text) =>
				text.setValue(theme.typography.header).onChange((value) => {
					theme.typography.header = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("Body font")
			.addText((text) =>
				text.setValue(theme.typography.body).onChange((value) => {
					theme.typography.body = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("Code font")
			.addText((text) =>
				text.setValue(theme.typography.code).onChange((value) => {
					theme.typography.code = value;
					this.markDirty();
				}),
			);

		new Setting(this.settingsRootElement)
			.setName("CDN caching")
			.setDesc("Cache fonts via CDN for faster loading.")
			.addToggle((toggle) =>
				toggle.setValue(theme.cdnCaching).onChange((value) => {
					theme.cdnCaching = value;
					this.markDirty();
				}),
			);
	}

	private async checkForUpdates(): Promise<void> {
		if (!this.cachedConfig || this.isCheckingUpdates) return;

		this.isCheckingUpdates = true;

		try {
			const gitSettings = this.plugin.getGitSettingsWithSecret();
			const checker = new QuartzPluginUpdateChecker(
				gitSettings.auth,
				gitSettings.corsProxyUrl,
			);

			const statuses = await checker.checkUpdates(
				this.cachedConfig.plugins,
				this.cachedLockFile,
			);

			this.cachedUpdateStatuses = new Map(
				statuses.map((s) => [s.sourceKey, s]),
			);

			const updatesAvailable = statuses.filter((s) => s.hasUpdate).length;

			if (updatesAvailable > 0) {
				new Notice(`${updatesAvailable} plugin update(s) available.`);
			} else {
				new Notice("All plugins are up to date.");
			}

			this.settingsRootElement.empty();
			this.renderContent();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to check for plugin updates", error);
			new Notice(`Failed to check for updates: ${message}`);
		} finally {
			this.isCheckingUpdates = false;
		}
	}

	private renderPluginListSection(): void {
		if (!this.cachedConfig) return;

		const plugins = this.cachedConfig.plugins;
		const lockPlugins = this.cachedLockFile?.plugins ?? {};

		const pluginHeading = new Setting(this.settingsRootElement)
			.setName("Plugins")
			.setDesc(
				`${plugins.length} plugin(s) configured. Toggle enabled state or adjust execution order.`,
			)
			.setHeading();

		pluginHeading.addButton((button) =>
			button
				.setButtonText(
					this.isCheckingUpdates
						? "Checking..."
						: "Check for updates",
				)
				.setDisabled(this.isCheckingUpdates)
				.onClick(async () => {
					await this.checkForUpdates();
				}),
		);

		if (plugins.length === 0) {
			new Setting(this.settingsRootElement)
				.setName("No plugins")
				.setDesc("No plugins are configured in your Quartz config.");

			return;
		}

		for (let i = 0; i < plugins.length; i++) {
			this.renderPluginEntry(plugins[i], i, plugins.length, lockPlugins);
		}
	}

	private renderPluginEntry(
		plugin: QuartzPluginEntry,
		index: number,
		total: number,
		lockPlugins: Record<string, QuartzLockFileEntry>,
	): void {
		const name = getPluginName(plugin.source);
		const infoParts: string[] = [];

		if (plugin.order !== undefined) {
			infoParts.push(`Order: ${plugin.order}`);
		}

		if (plugin.layout?.position) {
			infoParts.push(`Position: ${plugin.layout.position}`);
		}

		const key = getPluginSourceKey(plugin.source);
		const lockEntry = lockPlugins[key];

		if (lockEntry?.commit) {
			infoParts.push(`Commit: ${lockEntry.commit.slice(0, 7)}`);
		}

		const updateStatus = this.cachedUpdateStatuses?.get(key);

		if (updateStatus?.hasUpdate) {
			infoParts.push(
				`Update available: ${updateStatus.remoteCommit?.slice(0, 7)}`,
			);
		} else if (
			updateStatus &&
			!updateStatus.hasUpdate &&
			updateStatus.lockedCommit
		) {
			infoParts.push("Up to date");
		}

		if (updateStatus?.error) {
			infoParts.push(`Check failed: ${updateStatus.error}`);
		}

		const displayName = updateStatus?.hasUpdate ? `${name} *` : name;

		const setting = new Setting(this.settingsRootElement)
			.setName(displayName)
			.setDesc(infoParts.length > 0 ? infoParts.join(" · ") : "");

		setting.addToggle((toggle) =>
			toggle
				.setTooltip("Enable or disable this plugin")
				.setValue(plugin.enabled)
				.onChange((value) => {
					plugin.enabled = value;
					this.markDirty();
				}),
		);

		setting.addExtraButton((button) =>
			button
				.setIcon("arrow-up")
				.setTooltip("Move up")
				.setDisabled(index === 0)
				.onClick(() => this.movePlugin(index, index - 1)),
		);

		setting.addExtraButton((button) =>
			button
				.setIcon("arrow-down")
				.setTooltip("Move down")
				.setDisabled(index === total - 1)
				.onClick(() => this.movePlugin(index, index + 1)),
		);
	}

	private movePlugin(fromIndex: number, toIndex: number): void {
		if (!this.cachedConfig) return;

		const plugins = this.cachedConfig.plugins;

		if (toIndex < 0 || toIndex >= plugins.length) return;

		const [moved] = plugins.splice(fromIndex, 1);
		plugins.splice(toIndex, 0, moved);

		this.markDirty();
		this.settingsRootElement.empty();
		this.renderContent();
	}
}
