import { Notice, Platform, Plugin } from "obsidian";
import QuartzSyncerSettings, {
	type GitRemoteSettings,
} from "src/models/settings";
import {
	createGitBackend,
	registerBundledGitBackend,
} from "src/git/GitBackendFactory";
import { BundledGitBackend } from "src/git/backends/BundledGitBackend";
import { SecretStorageService } from "src/utils/SecretStorageService";
import { QuartzSyncerSettingTab } from "src/views/QuartzSyncerSettingTab";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import { ManualSetupModal } from "src/views/ManualSetupModal";
import { OnboardingWizard } from "src/views/OnboardingWizard/OnboardingWizard";
import {
	MigrationNotice,
	shouldShowMigrationNotice,
} from "src/views/MigrationNotice";
import { registerCliHandlers } from "src/cli/registerCliHandlers";
import type { CliHandler } from "src/cli/types";
import { DataStore } from "src/cache/DataStore";
import { Publisher } from "src/publisher/Publisher";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import { ProcessRunner } from "src/process/ProcessRunner";
import { BinaryDetector } from "src/process/BinaryDetector";
import { GitRunner } from "src/process/runners/GitRunner";
import { NpmRunner } from "src/process/runners/NpmRunner";
import { QuartzRunner } from "src/process/runners/QuartzRunner";
import { StatusBar, type StatusBarState } from "src/views/StatusBar";
import { OperabilityFacadeImpl } from "src/operability/OperabilityFacade";
import { EventBuffer } from "src/operability/EventBuffer";
import { PublicationCenterManager } from "src/operability/PublicationCenterManager";

/**
 * QuartzSyncer plugin settings.
 * @remarks
 * This interface defines the default settings for the QuartzSyncer plugin.
 */
export const DEFAULT_SETTINGS: QuartzSyncerSettings = {
	settingsSchemaVersion: 4,

	gitRemoteUrl: "",
	gitBranch: "v5",
	gitCorsProxyUrl: "",
	gitAuthType: "basic",
	gitAuthUsername: "",
	gitProviderHint: "github",

	vaultPath: "/",

	// Deprecated fields kept for migration
	githubRepo: undefined,
	githubUserName: undefined,
	githubToken: undefined,

	/** Quartz settings */
	contentFolder: "content",
	/** Frontmatter settings */
	publishFrontmatterKey: "publish",
	allNotesPublishableByDefault: false,
	showCreatedTimestamp: true,
	showUpdatedTimestamp: true,
	showPublishedTimestamp: false,
	usePermalink: false,

	includeAllFrontmatter: false,
	frontmatterFormat: "yaml",

	/**
	 * @privateRemarks
	 *
	 * These values are not configurable, but are the defaults in Quartz.
	 * They are included here in case the user wants to change them.
	 * Or to nake it easier to adapt the plugin to future changes in Quartz.
	 */
	createdTimestampKey: "created, created_at, date",
	updatedTimestampKey: "modified, lastmod, updated, last-modified",
	publishedTimestampKey: "published, publishDate, date",
	timestampFormat: "MMM dd, yyyy h:mm a",

	/** Performance settings */
	useCache: true,
	autoCleanOrphanedMedia: false,
	syncCache: true,
	persistCache: false,
	cacheTimestamp: 0,
	cache: "{}",

	/** Integration settings */
	/**
	 * Enable Auto Card Link integration.
	 * This will allow the plugin to use Auto Card Link queries in the published notes.
	 *
	 * Auto Card Link documentation: {@link https://github.com/nekoshita/obsidian-auto-card-link}
	 */
	useAutoCardLink: false,
	/**
	 * Enable Dataview integration.
	 * This will allow the plugin to use Dataview queries in the published notes.
	 *
	 * Dataview documentation: {@link https://blacksmithgu.github.io/obsidian-dataview/}
	 */
	useDataview: true,
	/**
	 * Enable Datacore integration.
	 * This will allow the plugin to use Excalidraw drawings in the published notes.
	 *
	 * Excalidraw documentation: {@link https://blacksmithgu.github.io/datacore/}
	 */
	useDatacore: false,
	/**
	 * Enable Excalidraw integration.
	 * This will sync Excalidraw drawings (`.excalidraw.md` files) to Quartz as-is.
	 * Rendering is handled by the Quartz Excalidraw plugin.
	 *
	 * Excalidraw Obsidian plugin: {@link https://excalidraw-obsidian.online/wiki/welcome}
	 * Quartz Excalidraw plugin: {@link https://github.com/quartz-community/obsidian-plugin-excalidraw}
	 */
	useExcalidraw: false,
	/**
	 * Enable Fantasy Statblocks integration.
	 * This will allow the plugin to use Fantasy Statblocks queries in the published notes.
	 *
	 * Fantasy Statblocks documentation: {@link https://plugins.javalent.com/statblocks}
	 */
	useFantasyStatblocks: false,
	/**
	 * Enable Bases integration.
	 * This will allow the plugin to publish Obsidian Bases (.base files) to Quartz.
	 *
	 * Bases documentation: {@link https://help.obsidian.md/bases}
	 */
	useBases: false,
	/**
	 * Enable Canvas integration.
	 * This will allow the plugin to publish JSON Canvas (.canvas files) to Quartz.
	 *
	 * Canvas documentation: {@link https://jsoncanvas.org/}
	 */
	useCanvas: false,

	manageSyncerStyles: true,

	/** Plugin state variables */
	lastUsedSettingsTab: "git",
	noteSettingsIsInitialized: false,
	pluginVersion: "",
	lastUpstreamCommitSha: "",
	upgradeCheckStrategy: "version",

	/** UI settings */
	diffViewStyle: "auto",
	diffContextLines: 3,
	allowArbitraryFilePublishing: false,
	arbitraryPublishPaths: [],

	/** Developer settings */
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: true,

	ENABLE_DEVELOPER_TOOLS: false,
};

/**
 * QuartzSyncer plugin main class.
 */
export default class QuartzSyncer extends Plugin {
	declare settings: QuartzSyncerSettings;
	appVersion!: string;
	secretStorageService!: SecretStorageService;
	dataStore!: DataStore;
	cliHandlers: Record<string, CliHandler> = {};
	private publisher: Publisher | null = null;
	private backgroundEngine: BackgroundEngine | null = null;
	private statusBarManager: StatusBar | null = null;
	private operabilityFacade: OperabilityFacadeImpl | null = null;
	private eventSink: EventBuffer | null = null;
	private publicationCenterManager: PublicationCenterManager | null = null;
	processRunner: ProcessRunner | null = null;
	binaryDetector: BinaryDetector | null = null;
	gitRunner: GitRunner | null = null;
	npmRunner: NpmRunner | null = null;
	quartzRunner: QuartzRunner | null = null;

	async onload() {
		this.appVersion = this.manifest.version;

		const rawData = (await this.loadData()) as Record<
			string,
			unknown
		> | null;
		const previousVersion =
			typeof rawData?.pluginVersion === "string"
				? rawData.pluginVersion
				: "";
		await this.loadSettings();

		if (__DEV__ || this.settings.ENABLE_DEVELOPER_TOOLS === true) {
			this.eventSink = new EventBuffer(500);
		}

		if (shouldShowMigrationNotice(previousVersion, this.appVersion)) {
			new MigrationNotice(this.app).open();
		}

		this.dataStore = new DataStore(
			this.app.vault.getName(),
			this.manifest.id,
			this.appVersion,
		);
		registerBundledGitBackend(BundledGitBackend);

		console.debug("Initializing QuartzSyncer plugin v" + this.appVersion);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		this.addCommands();
		this.cliHandlers = registerCliHandlers(this);
		this.addRibbonIcon("leaf", "Quartz Syncer publication center", () => {
			this.publicationCenterManager?.open() ??
				new PublicationCenter(this.app, this).open();
		});

		if (!this.settings.gitRemoteUrl && !this.settings.quartzRepoPath) {
			const notice = new Notice("", 0);
			const fragment = notice.messageEl.createDiv();
			fragment.createSpan({
				text: "Quartz Syncer: no repository configured. ",
			});
			const setupLink = fragment.createEl("a", {
				text: "Open setup wizard",
				href: "#",
			});
			setupLink.addEventListener("click", (e) => {
				e.preventDefault();
				notice.hide();
				if (Platform.isDesktopApp) {
					new OnboardingWizard(this.app, this).open();
				} else {
					new ManualSetupModal(this.app, this).open();
				}
			});
			fragment.createSpan({ text: " to get started." });
			const dismissLink = fragment.createEl("a", {
				text: "×",
				href: "#",
				cls: "quartz-syncer-notice-dismiss",
			});
			dismissLink.addEventListener("click", (e) => {
				e.preventDefault();
				notice.hide();
			});
		}

		const statusBarEl = this.addStatusBarItem();
		this.statusBarManager = new StatusBar(
			statusBarEl,
			(state: StatusBarState) => {
				if (state === "unconfigured") {
					if (Platform.isDesktopApp) {
						new OnboardingWizard(this.app, this).open();
					} else {
						new ManualSetupModal(this.app, this).open();
					}
				} else if (state === "error") {
					new Notice("Quartz Syncer: error");
				} else {
					this.publicationCenterManager?.open() ??
						new PublicationCenter(this.app, this).open();
				}
			},
		);
		const isConfigured =
			!!this.settings.gitRemoteUrl || !!this.settings.quartzRepoPath;
		this.statusBarManager.setState(isConfigured ? "ready" : "unconfigured");
		this.backgroundEngine = new BackgroundEngine(
			this.app,
			this,
			(state, count) => {
				this.statusBarManager?.setState(state, count);
			},
			this.eventSink ?? undefined,
		);
		this.backgroundEngine.start();

		if (Platform.isDesktopApp) {
			this.processRunner = new ProcessRunner();
			this.binaryDetector = new BinaryDetector(this.processRunner);
			this.gitRunner = new GitRunner(this.processRunner);
			this.npmRunner = new NpmRunner(this.processRunner);
			this.quartzRunner = new QuartzRunner(this.processRunner);
		}

		if (Platform.isDesktopApp && this.settings.autoPublishInterval > 0) {
			this.backgroundEngine.startAutoPublish(
				this.settings.autoPublishInterval,
			);
		}

		if (this.eventSink) {
			this.publicationCenterManager = new PublicationCenterManager(
				this.app,
				this,
			);
			this.operabilityFacade = new OperabilityFacadeImpl(
				this,
				this.eventSink,
			);
			window.__QS__ = this.operabilityFacade;
		}
	}

	onunload() {
		this.operabilityFacade?.shutdown();
		window.__QS__ = undefined;
		this.operabilityFacade = null;
		this.eventSink = null;
		this.publicationCenterManager = null;
		this.publisher?.stopPeriodicFetch();
		this.backgroundEngine?.stopAutoPublish();
		this.backgroundEngine?.stop();
		this.backgroundEngine = null;
		this.quartzRunner?.stopServe();
		this.publisher = null;
		this.processRunner = null;
		this.binaryDetector = null;
		this.gitRunner = null;
		this.npmRunner = null;
		this.quartzRunner = null;
		ProcessRunner.resetChildProcessCache();
		super.onunload();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as QuartzSyncerSettings,
		);

		this.migrateGitHubSettings();
		this.migrateNestedGitSettings();
		this.migrateRemovedThemesTab();
		this.migrateTimestampKeyDefaults();
		this.migrateDeprecatedSettingsV3();
		this.migrateDeprecatedSettingsV4();
		this.settings.pluginVersion = this.appVersion;
		await this.saveSettings();

		this.secretStorageService = new SecretStorageService(this.app);

		await this.secretStorageService.migrateFromSettings(this.settings, () =>
			this.saveSettings(),
		);
	}

	private migrateGitHubSettings(): void {
		type LegacyGitHubSettings = {
			githubRepo?: string;
			githubUserName?: string;
			githubToken?: string;
		};
		const legacySettings = this.settings as LegacyGitHubSettings;

		const hasLegacySettings =
			legacySettings.githubRepo ||
			legacySettings.githubUserName ||
			legacySettings.githubToken;

		const hasNewSettings = this.settings.gitRemoteUrl;

		if (hasLegacySettings && !hasNewSettings) {
			console.debug(
				"Migrating legacy GitHub settings to flat Git settings",
			);

			const githubRepo = legacySettings.githubRepo || "quartz";
			const githubUserName = legacySettings.githubUserName || "";
			const githubToken = legacySettings.githubToken || "";

			this.settings.gitRemoteUrl = githubUserName
				? `https://github.com/${githubUserName}/${githubRepo}.git`
				: "";
			this.settings.gitBranch = "v4";
			this.settings.gitCorsProxyUrl = "";
			this.settings.gitAuthType = "basic";
			this.settings.gitAuthUsername = githubUserName;
			this.settings.gitProviderHint = "github";

			if (githubToken) {
				(this.settings as unknown as Record<string, unknown>)[
					"_pendingTokenMigration"
				] = githubToken;
			}

			if (this.settings.lastUsedSettingsTab === "github") {
				this.settings.lastUsedSettingsTab = "git";
			}

			legacySettings.githubRepo = undefined;
			legacySettings.githubUserName = undefined;
			legacySettings.githubToken = undefined;
		}
	}

	private migrateNestedGitSettings(): void {
		const raw = this.settings as unknown as Record<string, unknown>;

		if (raw["git"] && typeof raw["git"] === "object") {
			console.debug("Migrating nested git settings to flat keys");

			const git = raw["git"] as Record<string, unknown>;
			const auth = (git["auth"] as Record<string, unknown>) || {};

			this.settings.gitRemoteUrl = (git["remoteUrl"] as string) || "";
			this.settings.gitBranch = (git["branch"] as string) || "v4";

			this.settings.gitCorsProxyUrl =
				(git["corsProxyUrl"] as string) || "";

			this.settings.gitAuthType =
				(auth["type"] as QuartzSyncerSettings["gitAuthType"]) ||
				"basic";
			this.settings.gitAuthUsername = (auth["username"] as string) || "";

			this.settings.gitProviderHint =
				(git[
					"providerHint"
				] as QuartzSyncerSettings["gitProviderHint"]) || "github";

			delete raw["git"];
			this.settings.settingsSchemaVersion = 2;
		}
	}

	private migrateTimestampKeyDefaults(): void {
		const oldCreated = ["", "created"];
		const oldUpdated = ["", "modified"];
		const oldPublished = ["", "published"];

		if (oldCreated.includes(this.settings.createdTimestampKey)) {
			this.settings.createdTimestampKey = "created, created_at, date";
		}

		if (oldUpdated.includes(this.settings.updatedTimestampKey)) {
			this.settings.updatedTimestampKey =
				"modified, lastmod, updated, last-modified";
		}

		if (oldPublished.includes(this.settings.publishedTimestampKey)) {
			this.settings.publishedTimestampKey =
				"published, publishDate, date";
		}
	}

	private migrateRemovedThemesTab(): void {
		const legacy = this.settings as unknown as Record<string, unknown>;

		if ("useThemes" in legacy) {
			delete legacy.useThemes;
		}

		if (this.settings.lastUsedSettingsTab === "themes") {
			this.settings.lastUsedSettingsTab = "git";
		}
	}

	private migrateDeprecatedSettingsV3(): void {
		if (this.settings.settingsSchemaVersion >= 3) return;

		const raw = this.settings as unknown as Record<string, unknown>;

		delete raw["syncCache"];
		delete raw["persistCache"];
		delete raw["noteSettingsIsInitialized"];
		delete raw["lastUpstreamCommitSha"];
		delete raw["upgradeCheckStrategy"];

		this.settings.settingsSchemaVersion = 3;
	}

	private migrateDeprecatedSettingsV4(): void {
		if (this.settings.settingsSchemaVersion >= 4) return;

		const raw = this.settings as unknown as Record<string, unknown>;

		if (typeof raw["autoCleanOrphanedMedia"] !== "boolean") {
			this.settings.autoCleanOrphanedMedia = false;
		}
		if (typeof raw["allowArbitraryFilePublishing"] !== "boolean") {
			this.settings.allowArbitraryFilePublishing = false;
		}
		if (!Array.isArray(raw["arbitraryPublishPaths"])) {
			this.settings.arbitraryPublishPaths = [];
		}

		this.settings.settingsSchemaVersion = 4;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.invalidateCachedInstances();
	}

	getSecretStorageService(): SecretStorageService {
		return this.secretStorageService;
	}

	pauseAutoPublish(): void {
		this.backgroundEngine?.pauseAutoPublish();
	}

	resumeAutoPublish(): void {
		this.backgroundEngine?.resumeAutoPublish();
	}

	private invalidateCachedInstances(): void {
		if (this.publisher) {
			this.publisher.stopPeriodicFetch();
			this.publisher = null;
		}
	}

	getGitSettingsWithSecret(): GitRemoteSettings {
		return {
			remoteUrl: this.settings.gitRemoteUrl,
			branch: this.settings.gitBranch,
			corsProxyUrl: this.settings.gitCorsProxyUrl || undefined,
			auth: {
				type: this.settings.gitAuthType,
				username: this.settings.gitAuthUsername || undefined,
				secret: this.secretStorageService.getToken() || undefined,
			},
			providerHint: this.settings.gitProviderHint || undefined,
		};
	}

	getPublisher(): Publisher | null {
		if (this.publisher) return this.publisher;

		const compiler = new SyncerPageCompiler(
			this.app,
			this.app.vault,
			this.settings,
			this.app.metadataCache,
			this.dataStore,
		);

		if (this.settings.quartzRepoPath) {
			const backend = new LocalPublishBackend(
				this.settings.quartzRepoPath,
			);

			this.publisher = new Publisher(
				this.app,
				this,
				backend,
				compiler,
				this.dataStore,
				this.backgroundEngine?.compilationQueue,
				this.eventSink ?? undefined,
			);

			return this.publisher;
		}

		if (this.settings.gitRemoteUrl) {
			const gitBackend = createGitBackend(
				{
					remoteUrl: this.settings.gitRemoteUrl,
					branch: this.settings.gitBranch,
					corsProxyUrl: this.settings.gitCorsProxyUrl || undefined,
					auth: {
						type: this.settings.gitAuthType,
						username: this.settings.gitAuthUsername || undefined,
						secret:
							this.secretStorageService.getToken() || undefined,
					},
				},
				this.app,
			);

			const backend = new RemotePublishBackend(
				gitBackend,
				this.settings.gitBranch,
			);

			this.publisher = new Publisher(
				this.app,
				this,
				backend,
				compiler,
				this.dataStore,
				this.backgroundEngine?.compilationQueue,
				this.eventSink ?? undefined,
			);

			if (this.settings.remoteFetchInterval > 0) {
				this.publisher.startPeriodicFetch(
					this.settings.remoteFetchInterval,
				);
			}

			return this.publisher;
		}

		return null;
	}

	getEventSink(): EventBuffer | null {
		return this.eventSink;
	}

	getBackgroundEngine(): BackgroundEngine | null {
		return this.backgroundEngine;
	}

	getStatusBar(): StatusBar | null {
		return this.statusBarManager;
	}

	getPublicationCenterManager(): PublicationCenterManager | null {
		return this.publicationCenterManager;
	}

	getEngineStatus(): {
		running: boolean;
		pending: number;
		autoPublish: boolean;
	} {
		return {
			running: this.backgroundEngine?.isRunning ?? false,
			pending: this.backgroundEngine?.pendingCount ?? 0,
			autoPublish: this.backgroundEngine?.isAutoPublishActive ?? false,
		};
	}

	private addCommands(): void {
		this.addCommand({
			id: "open-publish-modal",
			name: "Open publication center",
			callback: () => {
				this.publicationCenterManager?.open() ??
					new PublicationCenter(this.app, this).open();
			},
		});

		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "setup-wizard",
				name: "Setup wizard",
				callback: () => {
					new OnboardingWizard(this.app, this).open();
				},
			});
		}

		this.addCommand({
			id: "manual-setup",
			name: "Manual setup",
			callback: () => {
				new ManualSetupModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "publish-status",
			name: "Show publish status",
			callback: () => {
				this.publicationCenterManager?.open() ??
					new PublicationCenter(this.app, this).open();
			},
		});
	}
}
