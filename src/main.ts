import { Plugin } from "obsidian";
import QuartzSyncerSettings, {
	type GitRemoteSettings,
} from "src/models/settings";
import { registerBundledGitBackend } from "src/git/GitBackendFactory";
import { BundledGitBackend } from "src/git/backends/BundledGitBackend";
import { SecretStorageService } from "src/utils/SecretStorageService";
import { QuartzSyncerSettingTab } from "src/views/QuartzSyncerSettingTab";

/**
 * QuartzSyncer plugin settings.
 * @remarks
 * This interface defines the default settings for the QuartzSyncer plugin.
 */
const DEFAULT_SETTINGS: QuartzSyncerSettings = {
	settingsSchemaVersion: 2,

	gitRemoteUrl: "",
	gitBranch: "v4",
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

	/** Developer settings */
	ENABLE_DEVELOPER_TOOLS: false,
};

/**
 * QuartzSyncer plugin main class.
 */
export default class QuartzSyncer extends Plugin {
	declare settings: QuartzSyncerSettings;
	appVersion!: string;
	secretStorageService!: SecretStorageService;

	async onload() {
		this.appVersion = this.manifest.version;

		await this.loadSettings();
		registerBundledGitBackend(BundledGitBackend);

		console.debug("Initializing QuartzSyncer plugin v" + this.appVersion);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		this.addCommands();
		this.addRibbonIcon("leaf", "Quartz Syncer", () => {});
	}

	onunload() {
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

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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

	private addCommands(): void {
		this.addCommand({
			id: "publish-status",
			name: "Show publish status",
			callback: async () => {
				// Log status to console (dev aid — Phase 2 adds UI)
				console.debug(
					"Publish status: use Publication Center (coming in Phase 2)",
				);
			},
		});
	}
}
