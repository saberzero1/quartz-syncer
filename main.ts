import { Notice, Platform, Plugin, Workspace, addIcon } from "obsidian";
import Publisher from "./src/publisher/Publisher";
import QuartzSyncerSettings from "./src/models/settings";
import { quartzSyncerIcon } from "./src/ui/suggest/constants";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import { QuartzSyncerSettingTab } from "./src/views/QuartzSyncerSettingTab";
import { DataStore } from "src/publishFile/DataStore";
import Logger from "js-logger";

/**
 * QuartzSyncer plugin settings.
 * @remarks
 * This interface defines the default settings for the QuartzSyncer plugin.
 */
const DEFAULT_SETTINGS: QuartzSyncerSettings = {
	/** GitHub settings */
	githubRepo: "quartz",
	githubUserName: "",
	githubToken: "",
	vaultPath: "/",

	/** Quartz settings */
	contentFolder: "content",
	useFullResolutionImages: false,
	applyEmbeds: true,

	/** Frontmatter settings */
	publishFrontmatterKey: "publish",
	allNotesPublishableByDefault: false,
	showCreatedTimestamp: true,
	showUpdatedTimestamp: true,
	showPublishedTimestamp: false,
	usePermalink: false,

	includeAllFrontmatter: false,

	/**
	 * @privateRemarks
	 *
	 * These values are not configurable, but are the defaults in Quartz.
	 * They are included here in case the user wants to change them.
	 * Or to nake it easier to adapt the plugin to future changes in Quartz.
	 */
	pathRewriteRules: "",
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
	 * This will allow the plugin to use Excalidraw drawings in the published notes.
	 *
	 * Excalidraw documentation: {@link https://excalidraw-obsidian.online/wiki/welcome}
	 */
	useExcalidraw: false,
	/**
	 * Enable Fantasy Statblocks integration.
	 * This will allow the plugin to use Fantasy Statblocks queries in the published notes.
	 *
	 * Fantasy Statblocks documentation: {@link https://plugins.javalent.com/statblocks}
	 */
	useFantasyStatblocks: false,

	/** Themes settings */
	/**
	 * Enable themes integration.
	 * This will allow the plugin to use themes in the published notes.
	 *
	 * Themes documentation: {@link https://github.com/saberzero1/quartz-themes}
	 */
	useThemes: false,

	/** Plugin state variables */
	lastUsedSettingsTab: "github",
	noteSettingsIsInitialized: false,
	pluginVersion: "",

	/** Developer settings */
	logLevel: undefined,
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
	settings!: QuartzSyncerSettings;
	appVersion!: string;
	datastore!: DataStore;

	publishModal!: PublicationCenter;

	/**
	 * Called when the plugin is loaded.
	 * Initializes the plugin, loads settings, and sets up commands and icons.
	 */
	async onload() {
		this.appVersion = this.manifest.version;

		await this.loadSettings();

		if (this.settings.logLevel) Logger.setLevel(this.settings.logLevel);

		Logger.info("Initializing QuartzSyncer plugin v" + this.appVersion);

		Logger.info("Quartz Syncer log level set to " + Logger.getLevel().name);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		await this.addCommands();

		addIcon("quartz-syncer-icon", quartzSyncerIcon);

		this.addRibbonIcon(
			"quartz-syncer-icon",
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
		// Remove the datastore cache if it exists.
		// This will also clear the cache when the plugin is updated.
		if (!this.settings.persistCache) {
			this.clearCacheForAllFiles(true);
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
			await this.loadData(),
		);

		if (!this.datastore && this.settings.useCache) {
			this.datastore = new DataStore(
				this.app.vault.getName(),
				this.manifest.id,
				this.appVersion,
			);
		}

		// Check if the plugin has been updated
		// If so, clear the cache
		if (!this.settings || this.settings.pluginVersion !== this.appVersion) {
			await this.clearCacheForAllFiles(true);
			this.settings.pluginVersion = this.appVersion;
		}

		await this.compareDataToCache();
	}

	/**
	 * Saves the plugin settings to data.json.
	 * This method is called after any changes to the settings.
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Adds commands to the plugin.
	 * These commands can be triggered from the command palette or ribbon icon.
	 */
	async addCommands() {
		if (this.settings["ENABLE_DEVELOPER_TOOLS"] && Platform.isDesktop) {
			Logger.info("Developer tools enabled");

			const publisher = new Publisher(
				this.app,
				this,
				this.app.vault,
				this.app.metadataCache,
				this.settings,
				this.datastore,
			);

			import("./src/test/snapshot/generateSyncerSnapshot")
				.then((snapshotGen) => {
					this.addCommand({
						id: "generate-snapshot",
						name: "Generate snapshot",
						callback: async () => {
							await snapshotGen.generateSyncerSnapshot(
								this.settings,
								publisher,
							);
						},
					});
				})
				.catch((e) => {
					Logger.error("Unable to load generateSyncerSnapshot", e);
				});
		}

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
				this.setPublishFlagValue(true);
			},
		});

		this.addCommand({
			id: "unmark-note-for-publish",
			name: "Remove publication flag",
			callback: async () => {
				this.setPublishFlagValue(false);
			},
		});

		this.addCommand({
			id: "mark-toggle-publish-status",
			name: "Toggle publication flag",
			callback: async () => {
				this.togglePublishFlag();
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
		engine.set(this.settings.publishFrontmatterKey, value).apply();
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

		engine
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
			);

			const publisher = new Publisher(
				this.app,
				this,
				this.app.vault,
				this.app.metadataCache,
				this.settings,
				this.datastore,
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
