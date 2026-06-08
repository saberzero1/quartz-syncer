import {
	Setting,
	App,
	SettingPage,
	Notice,
	normalizePath,
	requestUrl,
	setIcon,
} from "obsidian";
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
	QuartzGlobalLayout,
	QuartzPageType,
	QuartzColorScheme,
} from "src/quartz/QuartzConfigTypes";
import {
	getPluginName,
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
import { ConfirmModal } from "src/ui/ConfirmModal";
import { PluginOptionsModal } from "src/views/PluginOptionsModal";

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
export class QuartzV5Page extends SettingPage {
	private app: App;
	private plugin: QuartzSyncer;

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
	private collapsedSections: Set<string> = new Set();
	private pluginRegistry = new QuartzPluginRegistry();
	private cachedThemesJson: Record<
		string,
		{
			compatibility: string[];
			modes: string[];
			variations: { name: string; injects: unknown }[];
		}
	> | null = null;
	private searchQuery = "";
	private searchableSettings: Array<{
		containerEl: HTMLElement;
		name: string;
		description: string;
	}> = [];
	private searchResultsEl: HTMLElement | null = null;
	private noResultsEl: HTMLElement | null = null;
	private saveButtonEl: HTMLButtonElement | null = null;
	private isLoading = false;
	private isSaving = false;
	private isCheckingUpdates = false;
	private isCheckingUpgrade = false;
	private isUpgrading = false;
	private isDirty = false;
	private pluginManager = new QuartzPluginManager();

	constructor(app: App, plugin: QuartzSyncer) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.title = "Quartz";
	}

	display(): void {
		this.containerEl.empty();
		this.searchableSettings = [];
		this.searchResultsEl = null;
		this.noResultsEl = null;
		this.saveButtonEl = null;

		this.renderQuartzHeader();
		this.renderContentFolderSetting();
		this.renderSearchBar();

		if (this.cachedConfig) {
			this.renderV5Content();
			this.applySearchFilter(this.searchQuery);
		} else {
			this.renderLoading();
			void this.loadV5Data();
		}
	}

	hide(): void {
		this.isLoading = false;
		this.isSaving = false;
		this.isCheckingUpdates = false;
		this.isCheckingUpgrade = false;
		this.isUpgrading = false;
		this.isDirty = false;
	}

	private renderQuartzHeader(): void {
		new Setting(this.containerEl)
			.setName("Quartz")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes.",
			)
			.setHeading();
	}

	private renderContentFolderSetting(): void {
		const contentFolderWrapper = this.containerEl.createDiv();

		new Setting(contentFolderWrapper)
			.setName("Content folder")
			.setDesc(
				'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content".',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.plugin.settings.contentFolder)
					.onChange(async (value) => {
						this.plugin.settings.contentFolder =
							normalizePath(value);
						await this.plugin.saveSettings();
					}),
			);

		this.registerSearchable(
			contentFolderWrapper,
			"Content folder",
			'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content".',
		);
	}

	private renderSearchBar(): void {
		const searchSetting = new Setting(this.containerEl);
		searchSetting.settingEl.addClass("quartz-syncer-v5-search-bar");

		this.searchResultsEl = searchSetting.nameEl.createSpan({
			cls: "quartz-syncer-v5-search-results",
		});

		searchSetting.addSearch((search) => {
			search
				.setPlaceholder("Filter settings...")
				.setValue(this.searchQuery)
				.onChange((value) => {
					this.searchQuery = value;
					this.applySearchFilter(value);
				});
		});
	}

	private renderLoading(): void {
		new Setting(this.containerEl)
			.setName("v5 Configuration")
			.setDesc("Loading configuration from repository...");
	}

	private renderNonV5Message(): void {
		new Setting(this.containerEl)
			.setName("Quartz v5 not detected")
			.setDesc(
				"Your Quartz site uses the v4 configuration format. " +
					"Run `npx quartz migrate` in your repository to enable plugin management from Obsidian.",
			);
	}

	private renderError(message: string): void {
		new Setting(this.containerEl)
			.setName("Error")
			.setDesc(message)
			.addButton((button) =>
				button.setButtonText("Retry").onClick(() => {
					this.resetCache();
					this.display();
				}),
			);
	}

	private renderCollapsibleHeading(
		name: string,
		description: string,
	): HTMLElement {
		const wrapper = this.containerEl.createDiv({
			cls: "quartz-syncer-v5-section",
		});
		wrapper.dataset.sectionHeading = "true";
		wrapper.dataset.sectionName = name;

		const isCollapsed =
			this.collapsedSections.has(name) && !this.searchQuery.trim();

		const setting = new Setting(wrapper)
			.setName(name)
			.setDesc(description)
			.setHeading();

		const chevron = setting.nameEl.createSpan({
			cls: `quartz-syncer-v5-section-chevron ${
				isCollapsed ? "" : "quartz-syncer-v5-section-chevron-open"
			}`,
		});
		setIcon(chevron, "chevron-right");

		setting.settingEl.addClass("quartz-syncer-v5-section-heading");

		setting.settingEl.addEventListener("click", (e) => {
			if (
				(e.target as HTMLElement).closest(
					"button, input, select, .checkbox-container",
				)
			)
				return;

			if (this.collapsedSections.has(name)) {
				this.collapsedSections.delete(name);
			} else {
				this.collapsedSections.add(name);
			}
			this.display();
		});

		this.registerSearchable(wrapper, name, description);

		return wrapper;
	}

	private renderSectionContent(sectionName: string): HTMLElement | null {
		if (
			this.collapsedSections.has(sectionName) &&
			!this.searchQuery.trim()
		) {
			return null;
		}

		return this.containerEl.createDiv({
			cls: "quartz-syncer-v5-section-content",
		});
	}

	private registerSearchable(
		containerEl: HTMLElement,
		name: string,
		description: string,
	): void {
		this.searchableSettings.push({
			containerEl,
			name: name.toLowerCase(),
			description: description.toLowerCase(),
		});
	}

	private applySearchFilter(query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		let matchCount = 0;

		for (const entry of this.searchableSettings) {
			if (entry.containerEl.dataset.sectionHeading === "true") {
				continue;
			}

			if (
				!normalizedQuery ||
				entry.name.includes(normalizedQuery) ||
				entry.description.includes(normalizedQuery)
			) {
				entry.containerEl.removeClass("quartz-syncer-hidden");
				matchCount++;
			} else {
				entry.containerEl.addClass("quartz-syncer-hidden");
			}
		}

		if (this.searchResultsEl) {
			if (normalizedQuery) {
				this.searchResultsEl.setText(
					`${matchCount} result${matchCount !== 1 ? "s" : ""}`,
				);
			} else {
				this.searchResultsEl.setText("");
			}
		}

		if (normalizedQuery && matchCount === 0) {
			if (!this.noResultsEl) {
				this.noResultsEl = this.containerEl.createDiv({
					cls: "quartz-syncer-v5-no-results",
					text: "No settings match your search.",
				});
			}
			this.noResultsEl.removeClass("quartz-syncer-hidden");
		} else if (this.noResultsEl) {
			this.noResultsEl.addClass("quartz-syncer-hidden");
		}

		this.updateSectionHeadingVisibility(normalizedQuery);
	}

	private updateSectionHeadingVisibility(normalizedQuery: string): void {
		const headings = Array.from(
			this.containerEl.querySelectorAll<HTMLElement>(
				"[data-section-heading='true']",
			),
		);

		for (const heading of headings) {
			if (!normalizedQuery) {
				heading.removeClass("quartz-syncer-hidden");

				const nextSibling =
					heading.nextElementSibling as HTMLElement | null;

				if (nextSibling?.hasClass("quartz-syncer-v5-section-content")) {
					nextSibling.removeClass("quartz-syncer-hidden");
				}
				continue;
			}

			let sibling = heading.nextElementSibling as HTMLElement | null;
			let hasVisibleChild = false;

			while (sibling) {
				if (sibling.dataset.sectionHeading === "true") {
					break;
				}

				if (sibling.hasClass("quartz-syncer-v5-section-content")) {
					const children = Array.from(
						sibling.children,
					) as HTMLElement[];

					hasVisibleChild = children.some(
						(child) => !child.hasClass("quartz-syncer-hidden"),
					);

					if (hasVisibleChild) {
						break;
					}
				} else if (!sibling.hasClass("quartz-syncer-hidden")) {
					hasVisibleChild = true;
					break;
				}

				sibling = sibling.nextElementSibling as HTMLElement | null;
			}

			if (hasVisibleChild) {
				heading.removeClass("quartz-syncer-hidden");

				const nextSibling =
					heading.nextElementSibling as HTMLElement | null;

				if (nextSibling?.hasClass("quartz-syncer-v5-section-content")) {
					nextSibling.removeClass("quartz-syncer-hidden");
				}
			} else {
				heading.addClass("quartz-syncer-hidden");

				const nextSibling =
					heading.nextElementSibling as HTMLElement | null;

				if (nextSibling?.hasClass("quartz-syncer-v5-section-content")) {
					nextSibling.addClass("quartz-syncer-hidden");
				}
			}
		}
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

			if (
				this.plugin.settings.upgradeCheckStrategy === "commit" &&
				!this.plugin.settings.lastUpstreamCommitSha
			) {
				void this.checkForQuartzUpgrade();
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.debug("Failed to load Quartz v5 config", error);
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
				this.plugin.settings,
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
		this.templateService = null;
		this.manifestService = null;
		this.configService = null;
		this.siteManager = null;
		this.isDirty = false;
	}

	private markDirty(): void {
		this.isDirty = true;

		if (this.saveButtonEl) {
			this.saveButtonEl.textContent = "Save*";
		}
	}

	private async saveConfig(): Promise<void> {
		if (!this.cachedConfig || !this.configService || this.isSaving) return;

		this.isSaving = true;

		try {
			await this.configService.writeConfig(this.cachedConfig);
			new Notice("Quartz configuration saved and pushed.");
			this.isDirty = false;
			this.display();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.debug("Failed to save Quartz config", error);
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
		this.renderStickyActionBar();
	}

	private renderVersionSection(): void {
		this.renderCollapsibleHeading(
			"Quartz v5 configuration",
			"Edit your Quartz v5 site configuration. Changes are pushed to your repository on save.",
		);
		const content = this.renderSectionContent("Quartz v5 configuration");

		if (!content) return;

		const versionLabel = this.cachedPackageVersion
			? `${this.cachedPackageVersion} (${this.cachedVersion})`
			: (this.cachedVersion ?? "unknown");

		const versionWrapper = content.createDiv();

		new Setting(versionWrapper)
			.setName("Quartz version")
			.setDesc(versionLabel);
		this.registerSearchable(versionWrapper, "Quartz version", versionLabel);

		const configFormat = this.cachedVersion === "v5-yaml" ? "YAML" : "JSON";

		const formatWrapper = content.createDiv();

		new Setting(formatWrapper)
			.setName("Configuration format")
			.setDesc(configFormat);

		this.registerSearchable(
			formatWrapper,
			"Configuration format",
			configFormat,
		);
	}

	private renderStickyActionBar(): void {
		const bar = this.containerEl.createDiv({
			cls: "quartz-syncer-v5-action-bar",
		});

		const barSetting = new Setting(bar);

		if (this.isDirty) {
			barSetting.setDesc("You have unsaved changes.");
		}

		barSetting.addButton((button) =>
			button
				.setButtonText(this.isDirty ? "Save*" : "Save")
				.setCta()
				.setDisabled(this.isSaving)
				.onClick(async () => {
					await this.saveConfig();
					this.isDirty = false;
					this.display();
				}),
		);

		this.saveButtonEl = barSetting.controlEl.querySelector("button");

		barSetting.addButton((button) =>
			button
				.setButtonText("Refresh")
				.setDisabled(this.isLoading)
				.onClick(() => {
					this.resetCache();
					this.isDirty = false;
					this.display();
				}),
		);
	}

	private renderUpgradeSection(): void {
		this.renderCollapsibleHeading("Quartz updates", "");
		const content = this.renderSectionContent("Quartz updates");

		if (!content) return;

		const checkWrapper = content.createDiv();

		const upgradeSetting = new Setting(checkWrapper)
			.setName("Check for Quartz updates")
			.setDesc("");
		this.registerSearchable(checkWrapper, "Check for Quartz updates", "");

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

		const strategy = this.plugin.settings.upgradeCheckStrategy;

		const strategyWrapper = content.createDiv();

		new Setting(strategyWrapper)
			.setName("Update check strategy")
			.setDesc(
				"Version: check for new Quartz releases. " +
					"Commit: check for any new upstream commits (including unreleased changes).",
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("version", "Version");
				dropdown.addOption("commit", "Commit");

				dropdown.setValue(strategy).onChange(async (value) => {
					this.plugin.settings.upgradeCheckStrategy = value as
						| "version"
						| "commit";
					await this.plugin.saveSettings();
					this.cachedUpgradeStatus = null;
					this.display();

					if (
						value === "commit" &&
						!this.plugin.settings.lastUpstreamCommitSha
					) {
						void this.checkForQuartzUpgrade();
					}
				});
			});

		this.registerSearchable(
			strategyWrapper,
			"Update check strategy",
			"Version: check for new Quartz releases. Commit: check for any new upstream commits (including unreleased changes).",
		);

		if (this.cachedUpgradeStatus) {
			const status = this.cachedUpgradeStatus;

			const upgradeAvailable =
				strategy === "commit"
					? status.hasNewerCommits
					: status.hasUpgrade;

			if (status.error) {
				const errorWrapper = content.createDiv();

				new Setting(errorWrapper)
					.setName("Upgrade check failed")
					.setDesc(status.error);

				this.registerSearchable(
					errorWrapper,
					"Upgrade check failed",
					status.error,
				);
			} else if (upgradeAvailable) {
				const desc =
					strategy === "commit"
						? `Latest upstream commit: ${
								status.latestUpstreamSha?.slice(0, 7) ??
								"unknown"
							}.`
						: `Your Quartz is at ${
								status.currentVersion ?? "unknown"
							}, upstream is at ${
								status.upstreamVersion ?? "unknown"
							}.`;

				const availableWrapper = content.createDiv();

				const upgradeSetting = new Setting(availableWrapper)
					.setName(
						strategy === "commit"
							? "New upstream commits available"
							: "Quartz upgrade available",
					)
					.setDesc(desc);

				this.registerSearchable(
					availableWrapper,
					strategy === "commit"
						? "New upstream commits available"
						: "Quartz upgrade available",
					desc,
				);

				upgradeSetting.addButton((button) =>
					button
						.setButtonText(
							this.isUpgrading ? "Upgrading..." : "Upgrade now",
						)
						.setDestructive()
						.setDisabled(this.isUpgrading)
						.onClick(async () => {
							const confirmed = await new ConfirmModal(
								this.app,
								"Upgrade Quartz",
								"This will merge upstream changes into your repository.",
								"Upgrade",
							).await();

							if (!confirmed) return;
							await this.performQuartzUpgrade();
						}),
				);
			} else if (strategy === "commit" && status.latestUpstreamSha) {
				const statusWrapper = content.createDiv();

				const desc = `Current upstream commit: ${status.latestUpstreamSha.slice(
					0,
					7,
				)}`;

				new Setting(statusWrapper)
					.setName("Quartz is up to date")
					.setDesc(desc);

				this.registerSearchable(
					statusWrapper,
					"Quartz is up to date",
					desc,
				);
			} else {
				const statusWrapper = content.createDiv();

				const desc = `Current version: ${
					status.currentVersion ?? "unknown"
				}`;

				new Setting(statusWrapper)
					.setName("Quartz is up to date")
					.setDesc(desc);

				this.registerSearchable(
					statusWrapper,
					"Quartz is up to date",
					desc,
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

			if (
				this.cachedUpgradeStatus.latestUpstreamSha &&
				!this.cachedUpgradeStatus.hasNewerCommits
			) {
				this.plugin.settings.lastUpstreamCommitSha =
					this.cachedUpgradeStatus.latestUpstreamSha;
				await this.plugin.saveSettings();
			}

			const useCommitStrategy =
				this.plugin.settings.upgradeCheckStrategy === "commit";

			const hasUpdate = useCommitStrategy
				? this.cachedUpgradeStatus.hasNewerCommits
				: this.cachedUpgradeStatus.hasUpgrade;

			if (hasUpdate) {
				new Notice(
					useCommitStrategy
						? "New upstream Quartz commits available. Use the Upgrade button in settings to upgrade."
						: "A Quartz upgrade is available. Use the Upgrade button in settings to upgrade.",
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
			console.debug("Failed to check for Quartz upgrade", error);
			new Notice(`Failed to check for Quartz upgrade: ${message}`);
		} finally {
			this.isCheckingUpgrade = false;
			this.display();
		}
	}

	private async performQuartzUpgrade(): Promise<void> {
		if (this.isUpgrading) return;

		this.isUpgrading = true;
		this.display();

		try {
			const siteManager = this.getOrCreateSiteManager();

			const upgradeService = new QuartzUpgradeService(
				siteManager.userSyncerConnection,
			);

			const result = await upgradeService.performUpgrade();

			if (result.success) {
				if (result.alreadyMerged) {
					new Notice("Quartz is already up to date.");
				} else {
					new Notice(
						`Quartz upgraded successfully to ${result.oid?.slice(
							0,
							7,
						)}.`,
					);
				}

				this.cachedUpgradeStatus = null;
				this.resetCache();
			} else {
				new Notice(result.error ?? "Upgrade failed.");
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.debug("Failed to upgrade Quartz", error);
			new Notice(`Failed to upgrade Quartz: ${message}`);
		} finally {
			this.isUpgrading = false;
			this.display();
		}
	}

	private renderTemplateSection(): void {
		if (this.cachedTemplateNames.length === 0) return;

		this.renderCollapsibleHeading(
			"Templates",
			"Apply a configuration template to replace your current settings with a preset.",
		);
		const content = this.renderSectionContent("Templates");

		if (!content) return;

		for (const templateName of this.cachedTemplateNames) {
			const templateWrapper = content.createDiv();
			const setting = new Setting(templateWrapper).setName(templateName);

			const cached = this.cachedTemplates.get(templateName);

			let desc = "";

			if (cached) {
				desc = `Title: "${cached.config.configuration.pageTitle}" · ${cached.config.plugins.length} plugin(s)`;
				setting.setDesc(desc);
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
					.setDestructive()
					.onClick(async () => {
						if (!this.cachedConfig || !this.templateService) return;

						const confirmed = await new ConfirmModal(
							this.app,
							"Apply template",
							`Apply template "${templateName}"? This will replace your current site configuration.`,
							"Apply",
						).await();

						if (!confirmed) return;

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
			this.registerSearchable(templateWrapper, templateName, desc);
		}
	}

	private renderSiteConfigSection(): void {
		if (!this.cachedConfig) return;

		const config = this.cachedConfig.configuration;

		this.renderCollapsibleHeading(
			"Site configuration",
			"Edit site settings. Changes are applied when you click Save above.",
		);
		const content = this.renderSectionContent("Site configuration");

		if (!content) {
			if (config.theme) {
				this.renderThemeSection(config);
			}

			return;
		}

		const pageTitleWrapper = content.createDiv();

		new Setting(pageTitleWrapper)
			.setName("Page title")
			.setDesc("The title shown in the browser tab and site header.")
			.addText((text) =>
				text.setValue(config.pageTitle).onChange((value) => {
					config.pageTitle = value;
					this.markDirty();
				}),
			);

		this.registerSearchable(
			pageTitleWrapper,
			"Page title",
			"The title shown in the browser tab and site header.",
		);

		const pageTitleSuffixWrapper = content.createDiv();

		new Setting(pageTitleSuffixWrapper)
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

		this.registerSearchable(
			pageTitleSuffixWrapper,
			"Page title suffix",
			'Appended to the page title on subpages (e.g. " | My Site").',
		);

		const spaWrapper = content.createDiv();

		new Setting(spaWrapper)
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

		this.registerSearchable(
			spaWrapper,
			"SPA mode",
			"Single Page Application mode for faster navigation between pages.",
		);

		const popoversWrapper = content.createDiv();

		new Setting(popoversWrapper)
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

		this.registerSearchable(
			popoversWrapper,
			"Popovers",
			"Show page preview popovers on hover.",
		);

		const localeWrapper = content.createDiv();

		new Setting(localeWrapper)
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

		this.registerSearchable(
			localeWrapper,
			"Locale",
			"BCP 47 locale tag for date formatting and i18n (e.g. en-US).",
		);

		const baseUrlWrapper = content.createDiv();

		new Setting(baseUrlWrapper)
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

		this.registerSearchable(
			baseUrlWrapper,
			"Base URL",
			"The base URL where your site is hosted (without protocol, e.g. example.com/quartz).",
		);

		if (config.analytics) {
			const analyticsWrapper = content.createDiv();

			new Setting(analyticsWrapper)
				.setName("Analytics provider")
				.setDesc(config.analytics.provider);

			this.registerSearchable(
				analyticsWrapper,
				"Analytics provider",
				config.analytics.provider,
			);
		}

		const ignoreWrapper = content.createDiv();

		new Setting(ignoreWrapper)
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

		this.registerSearchable(
			ignoreWrapper,
			"Ignore patterns",
			"Comma-separated glob patterns for files to exclude from processing.",
		);

		if (config.theme) {
			this.renderThemeSection(config);
		}
	}

	private renderThemeSection(config: QuartzV5Config["configuration"]): void {
		const theme = config.theme;

		this.renderCollapsibleHeading("Theme", "Typography and font settings.");
		const content = this.renderSectionContent("Theme");

		if (!content) return;

		const headerFontWrapper = content.createDiv();

		new Setting(headerFontWrapper).setName("Header font").addText((text) =>
			text.setValue(theme.typography.header).onChange((value) => {
				theme.typography.header = value;
				this.markDirty();
			}),
		);
		this.registerSearchable(headerFontWrapper, "Header font", "");

		const bodyFontWrapper = content.createDiv();

		new Setting(bodyFontWrapper).setName("Body font").addText((text) =>
			text.setValue(theme.typography.body).onChange((value) => {
				theme.typography.body = value;
				this.markDirty();
			}),
		);
		this.registerSearchable(bodyFontWrapper, "Body font", "");

		const codeFontWrapper = content.createDiv();

		new Setting(codeFontWrapper).setName("Code font").addText((text) =>
			text.setValue(theme.typography.code).onChange((value) => {
				theme.typography.code = value;
				this.markDirty();
			}),
		);
		this.registerSearchable(codeFontWrapper, "Code font", "");

		const cdnWrapper = content.createDiv();

		new Setting(cdnWrapper)
			.setName("CDN caching")
			.setDesc("Cache fonts via CDN for faster loading.")
			.addToggle((toggle) =>
				toggle.setValue(theme.cdnCaching).onChange((value) => {
					theme.cdnCaching = value;
					this.markDirty();
				}),
			);

		this.registerSearchable(
			cdnWrapper,
			"CDN caching",
			"Cache fonts via CDN for faster loading.",
		);

		const quartzThemesPlugin = this.findQuartzThemesPlugin();

		const themesToggleWrapper = content.createDiv();

		new Setting(themesToggleWrapper)
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

		this.registerSearchable(
			themesToggleWrapper,
			"Use Quartz Themes",
			"Use community color themes from Quartz Themes instead of manual color editing.",
		);

		if (quartzThemesPlugin) {
			this.renderQuartzThemesConfig(quartzThemesPlugin, content);
		} else {
			this.renderColorSchemeSection(
				"Light mode colors",
				theme.colors.lightMode,
				DEFAULT_LIGHT_COLORS,
				content,
			);

			this.renderColorSchemeSection(
				"Dark mode colors",
				theme.colors.darkMode,
				DEFAULT_DARK_COLORS,
				content,
			);
		}
	}

	private renderColorSchemeSection(
		heading: string,
		scheme: QuartzColorScheme,
		defaults: QuartzColorScheme,
		containerEl: HTMLElement,
	): void {
		const headingWrapper = containerEl.createDiv();
		headingWrapper.dataset.sectionHeading = "true";
		new Setting(headingWrapper).setName(heading).setHeading();
		this.registerSearchable(headingWrapper, heading, "");

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
			const fieldWrapper = containerEl.createDiv();
			const setting = new Setting(fieldWrapper).setName(label);
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
			this.registerSearchable(fieldWrapper, label, "");
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

	private renderQuartzThemesConfig(
		plugin: QuartzPluginEntry,
		containerEl: HTMLElement,
	): void {
		if (!plugin.options) {
			plugin.options = {};
		}

		const currentThemeName =
			(plugin.options["theme"] as string) ?? "default";

		const currentVariation =
			(plugin.options["variation"] as string | null) ?? null;

		const themes = this.cachedThemesJson;

		if (!themes) {
			const loadingWrapper = containerEl.createDiv();

			new Setting(loadingWrapper)
				.setName("Theme")
				.setDesc("Loading available themes...");

			this.registerSearchable(
				loadingWrapper,
				"Theme",
				"Loading available themes...",
			);
			void this.fetchThemesJson().then(() => this.display());

			return;
		}

		const themeNames = Object.keys(themes).sort();

		const themeWrapper = containerEl.createDiv();

		new Setting(themeWrapper)
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

		this.registerSearchable(
			themeWrapper,
			"Theme",
			"Select a community color theme.",
		);

		const selectedTheme = currentThemeName
			? themes[currentThemeName]
			: null;
		const variations = selectedTheme?.variations ?? [];

		if (variations.length > 0) {
			const variationWrapper = containerEl.createDiv();

			new Setting(variationWrapper)
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

			this.registerSearchable(
				variationWrapper,
				"Variation",
				"Select a theme variation.",
			);
		}
	}

	private async fetchThemesJson(): Promise<void> {
		if (this.cachedThemesJson) return;

		try {
			const response = await requestUrl({
				url: "https://raw.githubusercontent.com/saberzero1/quartz-themes/master/themes.json",
			});

			if (response.status < 200 || response.status >= 300) {
				console.debug(
					`Failed to fetch themes.json: ${response.status}`,
				);

				return;
			}

			const data = JSON.parse(response.text) as {
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
			console.debug("Failed to fetch themes.json:", error);
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
			console.debug("Failed to check for plugin updates", error);
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
			console.debug(`Failed to update ${pluginName}`, error);
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
			console.debug("Failed to update plugins", error);
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

		this.display();
	}

	private renderPluginListSection(): void {
		if (!this.cachedConfig) return;

		const plugins = this.cachedConfig.plugins;
		const lockPlugins = this.cachedLockFile?.plugins ?? {};

		this.renderCollapsibleHeading(
			"Plugins",
			`${plugins.length} plugin(s) configured. Toggle enabled state or adjust execution order.`,
		);
		const content = this.renderSectionContent("Plugins");

		if (!content) return;

		const pluginActionsWrapper = content.createDiv();

		const pluginActionsSetting = new Setting(pluginActionsWrapper)
			.setName("Plugin actions")
			.setDesc("");

		this.registerSearchable(
			pluginActionsWrapper,
			"Plugin actions",
			"Check for updates, update all, browse plugins.",
		);

		pluginActionsSetting.addButton((button) =>
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
			pluginActionsSetting.addButton((button) =>
				button
					.setButtonText(`Update all (${updatableCount})`)
					.onClick(async () => {
						await this.updateAllPlugins();
					}),
			);
		}

		pluginActionsSetting.addButton((button) =>
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

		const addPluginWrapper = content.createDiv();

		new Setting(addPluginWrapper)
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

		this.registerSearchable(
			addPluginWrapper,
			"Add plugin",
			'Enter a plugin source (e.g. "github:quartz-community/explorer").',
		);

		if (plugins.length === 0) {
			const emptyWrapper = content.createDiv();

			new Setting(emptyWrapper)
				.setName("No plugins")
				.setDesc("No plugins are configured in your Quartz config.");

			this.registerSearchable(
				emptyWrapper,
				"No plugins",
				"No plugins are configured in your Quartz config.",
			);

			return;
		}

		for (let i = 0; i < plugins.length; i++) {
			this.renderPluginEntry(
				plugins[i],
				i,
				plugins.length,
				lockPlugins,
				content,
			);
		}
	}

	private renderPluginEntry(
		plugin: QuartzPluginEntry,
		index: number,
		total: number,
		lockPlugins: Record<string, QuartzLockFileEntry>,
		containerEl: HTMLElement,
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
		const desc = infoParts.length > 0 ? infoParts.join(" · ") : "";
		const entryWrapper = containerEl.createDiv();

		const setting = new Setting(entryWrapper)
			.setName(displayName)
			.setDesc(desc);
		this.registerSearchable(entryWrapper, displayName, desc);

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
				.setIcon("settings")
				.setTooltip("Plugin settings")
				.onClick(() => {
					if (!this.cachedConfig) return;

					const modal = new PluginOptionsModal(this.app, {
						plugin,
						index,
						total,
						config: this.cachedConfig,
						manifest: this.cachedManifests.get(name) ?? null,
						manifestService: this.manifestService,
						updateStatus,
						onDirty: () => this.markDirty(),
						onMovePlugin: (from, to) => {
							this.movePlugin(from, to);
						},
						onRemovePlugin: (key) => {
							if (!this.cachedConfig) return;

							try {
								this.pluginManager.removePlugin(
									this.cachedConfig,
									key,
								);
								this.markDirty();
								this.display();

								new Notice(
									`Plugin "${name}" removed. Save to push changes.`,
								);
							} catch (error) {
								const message =
									error instanceof Error
										? error.message
										: String(error);
								new Notice(message);
							}
						},
						onUpdatePlugin: async (pluginName, commit) => {
							await this.updatePlugin(pluginName, commit);
						},
					});
					modal.open();
				}),
		);
	}

	private renderLayoutSection(): void {
		if (!this.cachedConfig) return;

		const config = this.cachedConfig;

		if (!config.layout) {
			config.layout = {};
		}

		const layout = config.layout;

		this.renderCollapsibleHeading(
			"Layout overrides",
			"Per-page-type layout overrides. Set a frame template or exclude plugins for specific page types.",
		);
		const content = this.renderSectionContent("Layout overrides");

		if (!content) return;

		for (const pageType of PAGE_TYPES) {
			this.renderPageTypeOverride(layout, pageType, content);
		}
	}

	private renderPageTypeOverride(
		layout: QuartzGlobalLayout,
		pageType: QuartzPageType,
		containerEl: HTMLElement,
	): void {
		if (!layout.byPageType) {
			layout.byPageType = {};
		}

		const override = layout.byPageType[pageType];
		const hasOverride = override !== undefined;

		const overrideWrapper = containerEl.createDiv();
		const setting = new Setting(overrideWrapper).setName(pageType);

		if (!hasOverride) {
			setting.setDesc("No overrides configured.");

			this.registerSearchable(
				overrideWrapper,
				pageType,
				"No overrides configured.",
			);

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

		this.registerSearchable(overrideWrapper, pageType, "");

		setting.addButton((button) =>
			button.setButtonText("Remove override").onClick(() => {
				if (layout.byPageType) {
					delete layout.byPageType[pageType];
				}

				this.markDirty();
				this.display();
			}),
		);

		const templateWrapper = containerEl.createDiv();

		new Setting(templateWrapper)
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

		this.registerSearchable(
			templateWrapper,
			"Template",
			`Frame template for ${pageType} pages.`,
		);

		const excludeWrapper = containerEl.createDiv();

		new Setting(excludeWrapper)
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

		this.registerSearchable(
			excludeWrapper,
			"Excluded plugins",
			`Comma-separated plugin names to exclude from ${pageType} pages.`,
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
