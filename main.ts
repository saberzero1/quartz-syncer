import { Notice, Plugin, Workspace } from "obsidian";
import Publisher from "./src/publisher/Publisher";
import QuartzSyncerSettings, {
	type GitRemoteSettings,
} from "./src/models/settings";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import { QuartzSyncerSettingTab } from "./src/views/QuartzSyncerSettingTab";
import { DataStore } from "src/publishFile/DataStore";
import { SecretStorageService } from "src/utils/SecretStorageService";
import { ExtendedCacheService } from "src/services/ExtendedCacheService";
import Logger from "js-logger";
import { registerCliHandlers } from "src/cli/registerCliHandlers";

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
	logLevel: Logger.OFF,
};

Logger.useDefaults({
	defaultLevel: Logger.WARN,
	formatter: function (messages, _context) {
		messages.unshift(new Date().toUTCString());
		messages.unshift("QS: ");
	},
});

/**
 * QuartzSyncer plugin main class.
 */
export default class QuartzSyncer extends Plugin {
	declare settings: QuartzSyncerSettings;
	appVersion!: string;
	datastore!: DataStore;
	secretStorageService!: SecretStorageService;
	extendedCache!: ExtendedCacheService;

	publishModal!: PublicationCenter;

	/**
	 * Called when the plugin is loaded.
	 * Initializes the plugin, loads settings, and sets up commands and icons.
	 */
	async onload() {
		this.appVersion = this.manifest.version;

		await this.loadSettings();
		this.extendedCache = new ExtendedCacheService(this.app);

		if (this.settings.logLevel) Logger.setLevel(this.settings.logLevel);

		Logger.info("Initializing QuartzSyncer plugin v" + this.appVersion);

		Logger.info("Quartz Syncer log level set to " + Logger.getLevel().name);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		await this.addCommands();
		registerCliHandlers(this);

		this.addRibbonIcon(
			"leaf",
			"Quartz Syncer publication center",
			async () => {
				this.openPublishModal();
			},
		);
	}

	/**
	 * Called when the plugin is unloaded.
	 * Cleans up resources and saves settings.
	 */
	onunload() {
		this.extendedCache?.destroy();

		// Remove the datastore cache if it exists.
		// This will also clear the cache when the plugin is updated.
		if (!this.settings.persistCache) {
			void this.clearCacheForAllFiles(true);
		}

		super.onunload();
	}

	/**
	 * Called when the plugin settings are changed externally.
	 * This method can be used to handle changes made to the settings outside of the plugin.
	 */
	async onExternalSettingsChange() {
		Logger.info("External settings change detected, reloading settings.");

		await this.compareDataToCache();
	}

	/**
	 * Loads the plugin settings from data.json.
	 * If the settings file does not exist, it initializes with default settings.
	 *
	 * @param initialLoad - If true, indicates that this is the initial load of the plugin.
	 */
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

		if (!this.datastore && this.settings.useCache) {
			this.datastore = new DataStore(
				this.app.vault.getName(),
				this.manifest.id,
				this.appVersion,
			);
		}

		if (!this.settings || this.settings.pluginVersion !== this.appVersion) {
			await this.clearCacheForAllFiles(true);
			this.settings.pluginVersion = this.appVersion;
		}

		await this.compareDataToCache();
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
			Logger.info(
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
			Logger.info("Migrating nested git settings to flat keys");

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

	/**
	 * Adds commands to the plugin.
	 * These commands can be triggered from the command palette or ribbon icon.
	 */
	async addCommands() {
		this.addCommand({
			id: "open-publish-modal",
			name: "Open publication center",
			callback: async () => {
				this.openPublishModal();
			},
		});

		this.addCommand({
			id: "mark-note-for-publish",
			name: "Add publication flag",
			callback: async () => {
				void this.setPublishFlagValue(true);
			},
		});

		this.addCommand({
			id: "unmark-note-for-publish",
			name: "Remove publication flag",
			callback: async () => {
				void this.setPublishFlagValue(false);
			},
		});

		this.addCommand({
			id: "mark-toggle-publish-status",
			name: "Toggle publication flag",
			callback: async () => {
				void this.togglePublishFlag();
			},
		});

		if (this.settings.useCache) {
			this.addCommand({
				id: "clear-cache-for-active-file",
				name: "Clear cache for active file",
				callback: async () => {
					await this.clearCacheForActiveFile();
				},
			});

			this.addCommand({
				id: "clear-cache-for-all-files",
				name: "Clear cache for all files",
				callback: async () => {
					await this.clearCacheForAllFiles();
				},
			});
		}
	}

	/**
	 * Retrieves the currently active file in the workspace.
	 * If no file is active, it shows a notice to the user.
	 *
	 * @param workspace - The current workspace instance.
	 * @returns The active file or null if no file is active.
	 */
	private getActiveFile(workspace: Workspace) {
		const activeFile = workspace.getActiveFile();

		if (!activeFile) {
			new Notice(
				"Quartz Syncer: No file is open/active. Please open a file and try again.",
			);

			return null;
		}

		return activeFile;
	}

	/**
	 * Clears the cache for the currently active file.
	 * If no file is active, it does nothing.
	 */
	async clearCacheForActiveFile() {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		const cacheKey = `file:${activeFile.path}`;

		if (this.settings.useCache) {
			await this.datastore.persister.removeItem(cacheKey);
			// Update the cache timestamp to invalidate the cache on next access.
			this.settings.cacheTimestamp = Date.now();

			await this.saveSettings();

			await this.datastore.setLastUpdateTimestamp(
				this.settings.cacheTimestamp,
				this,
			);
			Logger.info(`Cache cleared for file: ${activeFile.path}`);

			new Notice(
				`Quartz Syncer: Cache cleared for file: ${activeFile.path}`,
			);
		} else {
			Logger.warn("Cache is disabled, no action taken.");
			new Notice("Quartz Syncer: Cache is disabled, no action taken.");
		}
	}

	/**
	 * Clears the cache for all files.
	 * This method removes all cached data from the datastore.
	 * If the cache is disabled, it does nothing.
	 * It will show a confirmation dialog before clearing the cache.
	 *
	 * @param force - If true, skips the confirmation dialog.
	 */
	async clearCacheForAllFiles(force = false) {
		if (!force) {
			// Show confirmation dialog before clearing the cache
			// eslint-disable-next-line no-alert -- intentional user confirmation dialog
			const confirmation = confirm(
				"Are you sure you want to clear the Quartz Syncer cache for all files? This action cannot be undone.",
			);

			if (!confirmation) {
				Logger.info("Cache clearing cancelled by user.");
				new Notice("Quartz Syncer: Cache clearing cancelled.");

				return;
			}

			if (this.settings.useCache) {
				this.settings.cache = "{}";
				// Update the cache timestamp to invalidate the cache on next access.
				this.settings.cacheTimestamp = Date.now();

				await this.saveSettings();

				await this.datastore.setLastUpdateTimestamp(
					this.settings.cacheTimestamp,
					this,
				);
				await this.datastore.recreate();
				Logger.info("Cache cleared for all files.");
				new Notice("Quartz Syncer: Cache cleared for all files.");
			} else {
				Logger.warn("Cache is disabled, no action taken.");

				new Notice(
					"Quartz Syncer: Cache is disabled, no action taken.",
				);
			}
		} else {
			// If skipConfirmation is true, clear the cache without confirmation
			// This is useful for automated tasks, suchs as when the plugin is unloaded
			if (this.datastore) {
				this.settings.cache = "{}";
				this.settings.cacheTimestamp = Date.now();

				await this.saveSettings();
				await this.datastore.persister.clear();
				await this.datastore.dropOutdatedCache();
			}
		}
	}

	/**
	 * Sets the publication flag value in the frontmatter of the active file.
	 * If no file is active, it does nothing.
	 *
	 * @param value - The value to set for the publication flag.
	 */
	async setPublishFlagValue(value: boolean) {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		const engine = new ObsidianFrontMatterEngine(
			this.app.vault,
			this.app.metadataCache,
			activeFile,
			this.app.fileManager,
		);
		void engine.set(this.settings.publishFrontmatterKey, value).apply();
	}

	/**
	 * Toggles the publication flag value in the frontmatter of the active file.
	 * If no file is active, it does nothing.
	 */
	async togglePublishFlag() {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		const engine = new ObsidianFrontMatterEngine(
			this.app.vault,
			this.app.metadataCache,
			activeFile,
			this.app.fileManager,
		);

		void engine
			.set(
				this.settings.publishFrontmatterKey,
				!engine.get(this.settings.publishFrontmatterKey),
			)
			.apply();
	}

	/**
	 * Opens the publication center modal.
	 * If the modal is not already created, it initializes it with the necessary components.
	 */
	openPublishModal() {
		if (!this.publishModal) {
			const siteManager = new QuartzSyncerSiteManager(
				this.app.metadataCache,
				this.settings,
				this.getGitSettingsWithSecret(),
			);

			const publisher = new Publisher(
				this.app,
				this,
				this.app.vault,
				this.app.metadataCache,
				this.settings,
				this.datastore,
				this.extendedCache,
			);

			const publishStatusManager = new PublishStatusManager(
				siteManager,
				publisher,
			);

			this.publishModal = new PublicationCenter(
				this.app,
				publishStatusManager,
				publisher,
				siteManager,
				this.settings,
			);
		}
		this.publishModal.open();
	}

	/**
	 * Compares the current data.json cache with the saved cache.
	 * If the cache is outdated, it loads the data from the saved cache.
	 * If the cache is up-to-date, it does nothing.
	 *
	 * @remarks
	 * This method is called on plugin load and when settings are changed.
	 */
	async compareDataToCache() {
		if (!this.settings.useCache || !this.settings.syncCache) {
			return;
		}

		let timestamp: number | null =
			await this.datastore.getLastUpdateTimestamp();

		if (timestamp === null) {
			timestamp = 0; // Initialize timestamp if no cache is found
		}

		if (timestamp < this.settings.cacheTimestamp) {
			await this.datastore.saveToDataJson(timestamp, this);
		} else {
			await this.datastore.loadFromDataJson(timestamp, this);
		}
	}
}
