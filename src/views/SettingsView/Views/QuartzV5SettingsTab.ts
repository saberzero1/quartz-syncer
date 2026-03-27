import {
	Setting,
	App,
	PluginSettingTab,
	Notice,
	normalizePath,
} from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import type { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type {
	QuartzV5Config,
	QuartzLockFile,
	QuartzPluginEntry,
	QuartzPluginSource,
	QuartzVersion,
	QuartzLockFileEntry,
	QuartzLayoutPosition,
	QuartzDisplayMode,
	QuartzGlobalLayout,
	QuartzPageType,
	QuartzColorScheme,
} from "src/quartz/QuartzConfigTypes";
import {
	getPluginName,
	getPluginSourceKey,
	resolveSourceToGitUrl,
} from "src/quartz/QuartzPluginUtils";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import {
	QuartzPluginUpdateChecker,
	type PluginUpdateStatus,
} from "src/quartz/QuartzPluginUpdateChecker";
import {
	QuartzUpgradeService,
	type QuartzUpgradeStatus,
} from "src/quartz/QuartzUpgradeService";
import {
	QuartzTemplateService,
	type QuartzTemplate,
} from "src/quartz/QuartzTemplateService";
import { QuartzPluginManifestService } from "src/quartz/QuartzPluginManifestService";
import type { QuartzPluginManifest } from "src/quartz/QuartzConfigTypes";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";
import { PluginBrowserModal } from "src/views/PluginBrowser/PluginBrowserModal";
import Logger from "js-logger";

const logger = Logger.get("quartz-v5-settings");

const LAYOUT_POSITIONS: QuartzLayoutPosition[] = [
	"left",
	"right",
	"beforeBody",
	"afterBody",
	"body",
];

const DISPLAY_MODES: QuartzDisplayMode[] = [
	"all",
	"mobile-only",
	"desktop-only",
];

const DEFAULT_LIGHT_COLORS: QuartzColorScheme = {
	light: "#faf8f8",
	lightgray: "#e5e5e5",
	gray: "#b8b8b8",
	darkgray: "#4e4e4e",
	dark: "#2b2b2b",
	secondary: "#284b63",
	tertiary: "#84a59d",
	highlight: "rgba(143, 159, 169, 0.15)",
	textHighlight: "#fff23688",
};

const DEFAULT_DARK_COLORS: QuartzColorScheme = {
	light: "#161618",
	lightgray: "#393639",
	gray: "#646464",
	darkgray: "#d4d4d4",
	dark: "#ebebec",
	secondary: "#7b97aa",
	tertiary: "#84a59d",
	highlight: "rgba(143, 159, 169, 0.15)",
	textHighlight: "#fff23688",
};

const PAGE_TYPES: QuartzPageType[] = [
	"content",
	"folder",
	"tag",
	"canvas",
	"bases",
	"404",
];

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
	private cachedTemplateNames: string[] = [];
	private cachedTemplates: Map<string, QuartzTemplate> = new Map();
	private templateService: QuartzTemplateService | null = null;
	private manifestService: QuartzPluginManifestService | null = null;
	private cachedManifests: Map<string, QuartzPluginManifest | null> =
		new Map();
	private expandedPlugins: Set<string> = new Set();
	private pluginRegistry = new QuartzPluginRegistry();
	private cachedThemesJson: Record<
		string,
		{
			compatibility: string[];
			modes: string[];
			variations: { name: string; injects: unknown }[];
		}
	> | null = null;
	private isLoading = false;
	private isSaving = false;
	private isCheckingUpdates = false;
	private isCheckingUpgrade = false;
	private hasUnsavedChanges = false;
	private pluginManager = new QuartzPluginManager();

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

		this.settings.settings.lastUsedSettingsTab = "quartz";
		this.settings.plugin.saveSettings();

		this.renderQuartzHeader();
		this.renderContentFolderSetting();

		if (this.cachedConfig) {
			this.renderV5Content();
		} else {
			this.renderLoading();
			this.loadV5Data();
		}
	}

	private renderQuartzHeader(): void {
		new Setting(this.settingsRootElement)
			.setName("Quartz")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes.",
			)
			.setHeading();
	}

	private renderContentFolderSetting(): void {
		new Setting(this.settingsRootElement)
			.setName("Content folder")
			.setDesc(
				'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content".',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.settings.settings.contentFolder)
					.onChange(async (value) => {
						this.settings.settings.contentFolder =
							normalizePath(value);
						await this.settings.plugin.saveSettings();
					}),
			);
	}

	private renderLoading(): void {
		new Setting(this.settingsRootElement)
			.setName("v5 Configuration")
			.setDesc("Loading configuration from repository...");
	}

	private renderNonV5Message(): void {
		new Setting(this.settingsRootElement)
			.setName("Quartz v5 not detected")
			.setDesc(
				"Your Quartz site uses the v4 configuration format. " +
					"Run `npx quartz migrate` in your repository to enable plugin management from Obsidian.",
			);
	}

	private renderError(message: string): void {
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
				this.renderNonV5Message();
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

			this.templateService = new QuartzTemplateService(
				siteManager.userSyncerConnection,
			);

			const gitSettings = this.plugin.getGitSettingsWithSecret();

			this.manifestService = new QuartzPluginManifestService(
				gitSettings.auth,
				gitSettings.corsProxyUrl,
			);

			const [config, lockFile, packageVersion, templateNames] =
				await Promise.all([
					this.configService.readConfig(),
					this.configService.readLockFile(),
					this.loadPackageVersion(siteManager),
					this.templateService.listTemplateNames(),
				]);

			this.cachedConfig = config;
			this.cachedLockFile = lockFile;
			this.cachedPackageVersion = packageVersion;
			this.cachedTemplateNames = templateNames;

			this.display();
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
		this.cachedTemplateNames = [];
		this.cachedTemplates = new Map();
		this.cachedManifests = new Map();
		this.expandedPlugins = new Set();
		this.templateService = null;
		this.manifestService = null;
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

	private renderV5Content(): void {
		this.renderVersionSection();
		this.renderUpgradeSection();
		this.renderTemplateSection();
		this.renderSiteConfigSection();
		this.renderPluginListSection();
		this.renderLayoutSection();
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
				new Setting(this.settingsRootElement)
					.setName("Quartz update available")
					.setDesc(
						`Your Quartz is at ${status.currentVersion ?? "unknown"}, ` +
							`upstream is at ${status.upstreamVersion ?? "unknown"}. ` +
							"Run `npx quartz update` in your repository to upgrade.",
					);
			} else {
				new Setting(this.settingsRootElement)
					.setName("Quartz is up to date")
					.setDesc(
						`Current version: ${status.currentVersion ?? "unknown"}`,
					);
			}
		}
	}

	private async checkForQuartzUpgrade(): Promise<void> {
		if (this.isCheckingUpgrade) return;

		this.isCheckingUpgrade = true;
		this.display();

		try {
			const siteManager = this.getOrCreateSiteManager();

			const upgradeService = new QuartzUpgradeService(
				siteManager.userSyncerConnection,
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
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to check for Quartz upgrade", error);
			new Notice(`Failed to check for Quartz upgrade: ${message}`);
		} finally {
			this.isCheckingUpgrade = false;
			this.display();
		}
	}

	private renderTemplateSection(): void {
		if (this.cachedTemplateNames.length === 0) return;

		new Setting(this.settingsRootElement)
			.setName("Templates")
			.setDesc(
				"Apply a configuration template to replace your current settings with a preset.",
			)
			.setHeading();

		for (const templateName of this.cachedTemplateNames) {
			const setting = new Setting(this.settingsRootElement).setName(
				templateName,
			);

			const cached = this.cachedTemplates.get(templateName);

			if (cached) {
				setting.setDesc(
					`Title: "${cached.config.configuration.pageTitle}" · ${cached.config.plugins.length} plugin(s)`,
				);
			}

			setting.addButton((button) =>
				button.setButtonText("Preview").onClick(async () => {
					if (!this.templateService) return;

					const template =
						this.cachedTemplates.get(templateName) ??
						(await this.templateService.readTemplate(templateName));

					if (!template) {
						new Notice(
							`Could not load template "${templateName}".`,
						);

						return;
					}

					this.cachedTemplates.set(templateName, template);

					new Notice(
						`Template "${templateName}": ` +
							`${template.config.plugins.length} plugin(s), ` +
							`title "${template.config.configuration.pageTitle}"`,
					);
					this.display();
				}),
			);

			setting.addButton((button) =>
				button
					.setButtonText("Apply")
					.setWarning()
					.onClick(async () => {
						if (!this.cachedConfig || !this.templateService) return;

						const template =
							this.cachedTemplates.get(templateName) ??
							(await this.templateService.readTemplate(
								templateName,
							));

						if (!template) {
							new Notice(
								`Could not load template "${templateName}".`,
							);

							return;
						}

						this.cachedTemplates.set(templateName, template);

						this.templateService.applyTemplate(
							this.cachedConfig,
							template,
						);
						this.markDirty();
						this.display();

						new Notice(
							`Template "${templateName}" applied. Save to push changes.`,
						);
					}),
			);
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

		const quartzThemesPlugin = this.findQuartzThemesPlugin();

		new Setting(this.settingsRootElement)
			.setName("Use Quartz Themes")
			.setDesc(
				"Use community color themes from Quartz Themes instead of manual color editing.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(quartzThemesPlugin !== null)
					.onChange((enabled) => {
						if (!this.cachedConfig) return;

						if (enabled) {
							try {
								this.pluginManager.addPlugin(
									this.cachedConfig,
									{
										name: "quartz-themes",
										repo: "github:saberzero1/quartz-themes",
										subdir: "plugin",
										ref: "main",
									},
								);

								new Notice(
									"Quartz Themes plugin added. Save to push changes.",
								);
							} catch (error) {
								const message =
									error instanceof Error
										? error.message
										: String(error);
								new Notice(message);
							}
						} else {
							const idx = this.cachedConfig.plugins.findIndex(
								(p) =>
									getPluginName(p.source) === "quartz-themes",
							);

							if (idx !== -1) {
								this.cachedConfig.plugins.splice(idx, 1);

								new Notice(
									"Quartz Themes plugin removed. Save to push changes.",
								);
							}
						}

						this.markDirty();
						this.display();
					}),
			);

		if (quartzThemesPlugin) {
			this.renderQuartzThemesConfig(quartzThemesPlugin);
		} else {
			this.renderColorSchemeSection(
				"Light mode colors",
				theme.colors.lightMode,
				DEFAULT_LIGHT_COLORS,
			);

			this.renderColorSchemeSection(
				"Dark mode colors",
				theme.colors.darkMode,
				DEFAULT_DARK_COLORS,
			);
		}
	}

	private renderColorSchemeSection(
		heading: string,
		scheme: QuartzColorScheme,
		defaults: QuartzColorScheme,
	): void {
		new Setting(this.settingsRootElement).setName(heading).setHeading();

		const colorFields: { key: keyof QuartzColorScheme; label: string }[] = [
			{ key: "light", label: "Background" },
			{ key: "lightgray", label: "Light gray (borders)" },
			{ key: "gray", label: "Gray (graph, heavier borders)" },
			{ key: "darkgray", label: "Dark gray (body text)" },
			{ key: "dark", label: "Dark (headings)" },
			{ key: "secondary", label: "Secondary (link color)" },
			{ key: "tertiary", label: "Tertiary (hover states)" },
			{ key: "highlight", label: "Highlight (internal link bg)" },
			{ key: "textHighlight", label: "Text highlight (==marked==)" },
		];

		for (const { key, label } of colorFields) {
			const setting = new Setting(this.settingsRootElement).setName(
				label,
			);
			const currentValue = scheme[key];
			const defaultValue = defaults[key];
			const isHexColor = /^#[0-9a-fA-F]{3,8}$/.test(currentValue);

			if (currentValue !== defaultValue) {
				setting.addExtraButton((button) =>
					button
						.setIcon("reset")
						.setTooltip(`Reset to default: ${defaultValue}`)
						.onClick(() => {
							scheme[key] = defaultValue;
							this.markDirty();
							this.display();
						}),
				);
			}

			if (isHexColor) {
				setting.addColorPicker((picker) =>
					picker.setValue(currentValue).onChange((value) => {
						scheme[key] = value;
						this.markDirty();
						this.display();
					}),
				);
			}

			setting.addText((text) =>
				text.setValue(currentValue).onChange((value) => {
					scheme[key] = value;
					this.markDirty();
				}),
			);
		}
	}

	private findQuartzThemesPlugin(): QuartzPluginEntry | null {
		if (!this.cachedConfig) return null;

		return (
			this.cachedConfig.plugins.find(
				(p) => getPluginName(p.source) === "quartz-themes",
			) ?? null
		);
	}

	private renderQuartzThemesConfig(plugin: QuartzPluginEntry): void {
		if (!plugin.options) {
			plugin.options = {};
		}

		const currentThemeName =
			(plugin.options["theme"] as string) ?? "default";

		const currentVariation =
			(plugin.options["variation"] as string | null) ?? null;

		const themes = this.cachedThemesJson;

		if (!themes) {
			new Setting(this.settingsRootElement)
				.setName("Theme")
				.setDesc("Loading available themes...");
			this.fetchThemesJson().then(() => this.display());

			return;
		}

		const themeNames = Object.keys(themes).sort();

		new Setting(this.settingsRootElement)
			.setName("Theme")
			.setDesc("Select a community color theme.")
			.addDropdown((dropdown) => {
				for (const name of themeNames) {
					dropdown.addOption(name, name);
				}

				dropdown.setValue(currentThemeName).onChange((value) => {
					if (!plugin.options) plugin.options = {};
					plugin.options["theme"] = value || "default";

					// Reset variation when theme changes
					const selectedTheme = value ? themes[value] : null;

					const hasVariations =
						selectedTheme &&
						selectedTheme.variations &&
						selectedTheme.variations.length > 0;

					if (!hasVariations) {
						delete plugin.options["variation"];
					} else {
						plugin.options["variation"] = null;
					}

					this.markDirty();
					this.display();
				});
			});

		const selectedTheme = currentThemeName
			? themes[currentThemeName]
			: null;
		const variations = selectedTheme?.variations ?? [];

		if (variations.length > 0) {
			new Setting(this.settingsRootElement)
				.setName("Variation")
				.setDesc("Select a theme variation.")
				.addDropdown((dropdown) => {
					dropdown.addOption("", "— No variation —");

					for (const variation of variations) {
						dropdown.addOption(variation.name, variation.name);
					}

					dropdown
						.setValue(currentVariation ?? "")
						.onChange((value) => {
							if (!plugin.options) plugin.options = {};

							if (value) {
								plugin.options["variation"] = value;
							} else {
								delete plugin.options["variation"];
							}

							this.markDirty();
						});
				});
		}
	}

	private async fetchThemesJson(): Promise<void> {
		if (this.cachedThemesJson) return;

		try {
			const response = await fetch(
				"https://raw.githubusercontent.com/saberzero1/quartz-themes/master/themes.json",
			);

			if (!response.ok) {
				logger.warn(`Failed to fetch themes.json: ${response.status}`);

				return;
			}

			const data = (await response.json()) as {
				themes: Record<
					string,
					{
						compatibility: string[];
						modes: string[];
						variations: { name: string; injects: unknown }[];
					}
				>;
			};

			this.cachedThemesJson = data.themes;
		} catch (error) {
			logger.warn("Failed to fetch themes.json:", error);
		}
	}

	private async checkForUpdates(): Promise<void> {
		if (!this.cachedConfig || this.isCheckingUpdates) return;

		this.isCheckingUpdates = true;
		this.display();

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
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to check for plugin updates", error);
			new Notice(`Failed to check for updates: ${message}`);
		} finally {
			this.isCheckingUpdates = false;
			this.display();
		}
	}

	private async updatePlugin(
		pluginName: string,
		newCommit: string,
	): Promise<void> {
		if (!this.cachedLockFile || !this.configService) return;

		const lockEntry = this.cachedLockFile.plugins[pluginName];

		if (!lockEntry) {
			new Notice(`No lock entry found for ${pluginName}.`);

			return;
		}

		try {
			lockEntry.commit = newCommit;
			lockEntry.installedAt = new Date().toISOString();

			await this.configService.writeLockFile(
				this.cachedLockFile,
				`Update ${pluginName} to ${newCommit.slice(0, 7)} via Syncer`,
			);

			if (this.cachedUpdateStatuses) {
				this.cachedUpdateStatuses.delete(pluginName);
			}

			new Notice(`Updated ${pluginName} to ${newCommit.slice(0, 7)}.`);
			this.display();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn(`Failed to update ${pluginName}`, error);
			new Notice(`Failed to update ${pluginName}: ${message}`);
		}
	}

	private async updateAllPlugins(): Promise<void> {
		if (
			!this.cachedLockFile ||
			!this.configService ||
			!this.cachedUpdateStatuses
		)
			return;

		const updatable = [...this.cachedUpdateStatuses.values()].filter(
			(s) => s.hasUpdate && s.remoteCommit,
		);

		if (updatable.length === 0) {
			new Notice("No plugin updates available.");

			return;
		}

		try {
			for (const status of updatable) {
				const lockEntry = this.cachedLockFile.plugins[status.sourceKey];

				if (lockEntry && status.remoteCommit) {
					lockEntry.commit = status.remoteCommit;
					lockEntry.installedAt = new Date().toISOString();
				}
			}

			const names = updatable.map((s) => s.sourceKey).join(", ");

			await this.configService.writeLockFile(
				this.cachedLockFile,
				`Update ${updatable.length} plugin(s) via Syncer: ${names}`,
			);

			this.cachedUpdateStatuses = null;

			new Notice(`Updated ${updatable.length} plugin(s): ${names}`);
			this.display();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn("Failed to update plugins", error);
			new Notice(`Failed to update plugins: ${message}`);
		}
	}

	private async installPlugin(source: QuartzPluginSource): Promise<void> {
		if (!this.cachedConfig || !this.configService) {
			throw new Error("Configuration not loaded.");
		}

		const entry = this.pluginManager.addPlugin(this.cachedConfig, source);

		if (this.manifestService) {
			try {
				const manifest =
					await this.manifestService.fetchManifest(source);

				if (manifest?.defaultOptions) {
					entry.options = { ...manifest.defaultOptions };
				}
			} catch {
				// Manifest fetch is best-effort; proceed without defaults
			}
		}

		await this.configService.writeConfig(this.cachedConfig);

		const gitSettings = this.plugin.getGitSettingsWithSecret();

		try {
			const checker = new QuartzPluginUpdateChecker(
				gitSettings.auth,
				gitSettings.corsProxyUrl,
			);

			const statuses = await checker.checkUpdates(
				[entry],
				this.cachedLockFile,
			);

			const status = statuses[0];

			if (
				status?.remoteCommit &&
				this.cachedLockFile &&
				this.configService
			) {
				const name = getPluginName(source);

				this.cachedLockFile.plugins[name] = {
					source,
					resolved: resolveSourceToGitUrl(source),
					commit: status.remoteCommit,
					installedAt: new Date().toISOString(),
				};

				await this.configService.writeLockFile(
					this.cachedLockFile,
					`Install ${name} via Syncer`,
				);
			}
		} catch {
			// Lock file update is best-effort
		}

		this.hasUnsavedChanges = false;
		this.display();
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

		const updatableCount = this.cachedUpdateStatuses
			? [...this.cachedUpdateStatuses.values()].filter((s) => s.hasUpdate)
					.length
			: 0;

		if (updatableCount > 0) {
			pluginHeading.addButton((button) =>
				button
					.setButtonText(`Update all (${updatableCount})`)
					.onClick(async () => {
						await this.updateAllPlugins();
					}),
			);
		}

		pluginHeading.addButton((button) =>
			button.setButtonText("Browse plugins").onClick(() => {
				if (!this.cachedConfig) return;

				const modal = new PluginBrowserModal(
					this.app,
					this.pluginRegistry,
					this.cachedConfig,
					async (source) => this.installPlugin(source),
				);

				modal.open();
			}),
		);

		let addPluginSource = "";

		new Setting(this.settingsRootElement)
			.setName("Add plugin")
			.setDesc(
				'Enter a plugin source (e.g. "github:quartz-community/explorer").',
			)
			.addText((text) =>
				text.setPlaceholder("github:org/plugin").onChange((value) => {
					addPluginSource = value;
				}),
			)
			.addButton((button) =>
				button.setButtonText("Add").onClick(() => {
					if (!this.cachedConfig || !addPluginSource.trim()) return;

					try {
						this.pluginManager.addPlugin(
							this.cachedConfig,
							addPluginSource.trim(),
						);
						this.markDirty();
						this.display();

						new Notice(
							`Plugin "${addPluginSource.trim()}" added. Save to push changes.`,
						);
					} catch (error) {
						const message =
							error instanceof Error
								? error.message
								: String(error);
						new Notice(message);
					}
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

		const lockEntry = lockPlugins[name];

		if (lockEntry?.commit) {
			infoParts.push(`Commit: ${lockEntry.commit.slice(0, 7)}`);
		}

		const updateStatus = this.cachedUpdateStatuses?.get(name);

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

		setting.addExtraButton((button) =>
			button
				.setIcon("trash")
				.setTooltip("Remove plugin")
				.onClick(() => {
					if (!this.cachedConfig) return;

					const key = getPluginSourceKey(plugin.source);

					try {
						this.pluginManager.removePlugin(this.cachedConfig, key);
						this.markDirty();
						this.display();

						new Notice(
							`Plugin "${getPluginName(plugin.source)}" removed. Save to push changes.`,
						);
					} catch (error) {
						const message =
							error instanceof Error
								? error.message
								: String(error);
						new Notice(message);
					}
				}),
		);

		if (plugin.layout) {
			this.renderPluginLayoutControls(plugin);
		}

		if (updateStatus?.hasUpdate && updateStatus.remoteCommit) {
			setting.addExtraButton((button) =>
				button
					.setIcon("download")
					.setTooltip(
						`Update to ${updateStatus.remoteCommit?.slice(0, 7)}`,
					)
					.onClick(async () => {
						await this.updatePlugin(
							name,
							updateStatus.remoteCommit!,
						);
					}),
			);
		}

		const isExpanded = this.expandedPlugins.has(name);

		setting.addExtraButton((button) =>
			button
				.setIcon(isExpanded ? "chevron-up" : "settings")
				.setTooltip(isExpanded ? "Hide options" : "Show options")
				.onClick(async () => {
					if (isExpanded) {
						this.expandedPlugins.delete(name);
					} else {
						this.expandedPlugins.add(name);

						if (
							!this.cachedManifests.has(name) &&
							this.manifestService
						) {
							const manifest =
								await this.manifestService.fetchManifest(
									plugin.source,
								);
							this.cachedManifests.set(name, manifest);
						}
					}

					this.display();
				}),
		);

		if (isExpanded) {
			this.renderPluginOptions(plugin, name);
		}
	}

	private renderPluginOptions(
		plugin: QuartzPluginEntry,
		sourceKey: string,
	): void {
		if (!plugin.options) {
			plugin.options = {};
		}

		const manifest = this.cachedManifests.get(sourceKey);
		const schema = manifest?.optionSchema ?? manifest?.configSchema ?? null;

		const optionKeys = new Set<string>([
			...Object.keys(plugin.options),
			...(schema ? Object.keys(schema) : []),
		]);

		if (optionKeys.size === 0) {
			new Setting(this.settingsRootElement).setDesc(
				manifest
					? "This plugin has no configurable options."
					: "Loading manifest failed. You can still edit options manually.",
			);
		}

		for (const optKey of optionKeys) {
			const currentValue = plugin.options[optKey];

			const schemaEntry = schema?.[optKey] as
				| Record<string, unknown>
				| undefined;
			const label = (schemaEntry?.title as string) ?? optKey;
			const desc = (schemaEntry?.description as string) ?? "";

			const setting = new Setting(this.settingsRootElement)
				.setName(label)
				.setDesc(desc);

			if (typeof currentValue === "boolean") {
				setting.addToggle((toggle) =>
					toggle.setValue(currentValue).onChange((value) => {
						plugin.options![optKey] = value;
						this.markDirty();
					}),
				);
			} else if (
				typeof currentValue === "number" ||
				schemaEntry?.type === "number" ||
				schemaEntry?.type === "integer"
			) {
				setting.addText((text) =>
					text
						.setValue(
							currentValue !== undefined
								? String(currentValue)
								: "",
						)
						.setPlaceholder(
							schemaEntry?.default !== undefined
								? String(schemaEntry.default)
								: "",
						)
						.onChange((value) => {
							const num = parseFloat(value);

							plugin.options![optKey] = isNaN(num)
								? undefined
								: num;
							this.markDirty();
						}),
				);
			} else {
				setting.addText((text) =>
					text
						.setValue(
							currentValue !== undefined
								? String(currentValue)
								: "",
						)
						.setPlaceholder(
							schemaEntry?.default !== undefined
								? String(schemaEntry.default)
								: "",
						)
						.onChange((value) => {
							plugin.options![optKey] = value || undefined;
							this.markDirty();
						}),
				);
			}
		}

		let newOptionKey = "";

		new Setting(this.settingsRootElement)
			.setDesc("Add a custom option key.")
			.addText((text) =>
				text.setPlaceholder("optionKey").onChange((value) => {
					newOptionKey = value;
				}),
			)
			.addButton((button) =>
				button.setButtonText("Add option").onClick(() => {
					if (!newOptionKey.trim() || !plugin.options) return;

					if (plugin.options[newOptionKey.trim()] !== undefined) {
						new Notice(
							`Option "${newOptionKey.trim()}" already exists.`,
						);

						return;
					}

					plugin.options[newOptionKey.trim()] = "";
					this.markDirty();
					this.display();
				}),
			);
	}

	private renderPluginLayoutControls(plugin: QuartzPluginEntry): void {
		if (!plugin.layout) return;

		const layout = plugin.layout;

		const layoutSetting = new Setting(this.settingsRootElement).setDesc(
			"Layout: position, priority, and display mode for this plugin's component.",
		);

		layoutSetting.addDropdown((dropdown) => {
			dropdown.addOption("", "No position");

			for (const pos of LAYOUT_POSITIONS) {
				dropdown.addOption(pos, pos);
			}

			dropdown.setValue(layout.position ?? "").onChange((value) => {
				layout.position = (value as QuartzLayoutPosition) || undefined;
				this.markDirty();
			});
		});

		layoutSetting.addText((text) =>
			text
				.setPlaceholder("Priority")
				.setValue(
					layout.priority !== undefined
						? String(layout.priority)
						: "",
				)
				.onChange((value) => {
					const num = parseInt(value, 10);
					layout.priority = isNaN(num) ? undefined : num;
					this.markDirty();
				}),
		);

		layoutSetting.addDropdown((dropdown) => {
			for (const mode of DISPLAY_MODES) {
				dropdown.addOption(mode, mode);
			}

			dropdown.setValue(layout.display ?? "all").onChange((value) => {
				layout.display = value as QuartzDisplayMode;
				this.markDirty();
			});
		});
	}

	private renderLayoutSection(): void {
		if (!this.cachedConfig) return;

		const config = this.cachedConfig;

		if (!config.layout) {
			config.layout = {};
		}

		const layout = config.layout;

		new Setting(this.settingsRootElement)
			.setName("Layout Overrides")
			.setDesc(
				"Per-page-type layout overrides. Set a frame template or exclude plugins for specific page types.",
			)
			.setHeading();

		for (const pageType of PAGE_TYPES) {
			this.renderPageTypeOverride(layout, pageType);
		}
	}

	private renderPageTypeOverride(
		layout: QuartzGlobalLayout,
		pageType: QuartzPageType,
	): void {
		if (!layout.byPageType) {
			layout.byPageType = {};
		}

		const override = layout.byPageType[pageType];
		const hasOverride = override !== undefined;

		const setting = new Setting(this.settingsRootElement).setName(pageType);

		if (!hasOverride) {
			setting.setDesc("No overrides configured.");

			setting.addButton((button) =>
				button.setButtonText("Add override").onClick(() => {
					if (!layout.byPageType) {
						layout.byPageType = {};
					}

					layout.byPageType[pageType] = {};
					this.markDirty();
					this.display();
				}),
			);

			return;
		}

		setting.addButton((button) =>
			button.setButtonText("Remove override").onClick(() => {
				if (layout.byPageType) {
					delete layout.byPageType[pageType];
				}

				this.markDirty();
				this.display();
			}),
		);

		new Setting(this.settingsRootElement)
			.setName("Template")
			.setDesc(`Frame template for ${pageType} pages.`)
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Default");

				const frameNames = [
					"default",
					"full-width",
					"minimal",
					...this.cachedTemplateNames.filter(
						(n) =>
							n !== "default" &&
							n !== "full-width" &&
							n !== "minimal",
					),
				];

				for (const frame of frameNames) {
					dropdown.addOption(frame, frame);
				}

				dropdown.setValue(override.template ?? "").onChange((value) => {
					override.template = value || undefined;
					this.markDirty();
				});
			});

		new Setting(this.settingsRootElement)
			.setName("Excluded plugins")
			.setDesc(
				`Comma-separated plugin names to exclude from ${pageType} pages.`,
			)
			.addText((text) =>
				text
					.setPlaceholder("reader-mode, graph")
					.setValue((override.exclude ?? []).join(", "))
					.onChange((value) => {
						override.exclude = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);

						if (override.exclude.length === 0) {
							override.exclude = undefined;
						}

						this.markDirty();
					}),
			);
	}

	private movePlugin(fromIndex: number, toIndex: number): void {
		if (!this.cachedConfig) return;

		const plugins = this.cachedConfig.plugins;

		if (toIndex < 0 || toIndex >= plugins.length) return;

		const [moved] = plugins.splice(fromIndex, 1);
		plugins.splice(toIndex, 0, moved);

		this.markDirty();
		this.display();
	}
}
