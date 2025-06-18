import { ILogLevel } from "js-logger";

/**
 * QuartzSyncer plugin settings.
 * Saved to data.json, changing requires a migration
 */
export default interface QuartzSyncerSettings {
	/** GitHub settings */
	githubRepo: string;
	githubUserName: string;
	githubToken: string;
	vaultPath: string;

	/** Quartz settings */
	contentFolder: string;
	useFullResolutionImages: boolean;
	applyEmbeds: boolean;

	/** Frontmatter settings */
	publishFrontmatterKey: string;
	showCreatedTimestamp: boolean;
	showUpdatedTimestamp: boolean;
	showPublishedTimestamp: boolean;
	usePermalink: boolean;

	includeAllFrontmatter: boolean;

	/**
	 * @privateRemarks
	 *
	 * These values are not configurable, but are the defaults in Quartz.
	 * They are included here in case the user wants to change them.
	 * Or to nake it easier to adapt the plugin to future changes in Quartz.
	 */
	pathRewriteRules: string;
	createdTimestampKey: string;
	updatedTimestampKey: string;
	publishedTimestampKey: string;
	timestampFormat: string;

	/** Performance settings */
	useCache: boolean;
	syncCache: boolean;
	persistCache: boolean;
	cacheTimestamp: number;
	cache: string;

	/** Integration settings */
	/**
	 * Enable Dataview integration.
	 * This will allow the plugin to use Dataview queries in the published notes.
	 *
	 * Dataview documentation: {@link https://blacksmithgu.github.io/obsidian-dataview/}
	 */
	useDataview: boolean;
	/**
	 * Enable Excalidraw integration.
	 * This will allow the plugin to use Excalidraw drawings in the published notes.
	 *
	 * Excalidraw documentation: {@link https://blacksmithgu.github.io/datacore/}
	 */
	useDatacore: boolean;
	/**
	 * Enable Excalidraw integration.
	 * This will allow the plugin to use Excalidraw drawings in the published notes.
	 *
	 * Excalidraw documentation: {@link https://excalidraw-obsidian.online/wiki/welcome}
	 */
	useExcalidraw: boolean;
	/**
	 * Enable Fantasy Statblock integration.
	 * This will allow the plugin to use Fantasy Statblock queries in the published notes.
	 *
	 * Fantasy Statblock documentation: {@link https://plugins.javalent.com/statblocks}
	 */
	useFantasyStatblock: boolean;

	/** Themes settings */
	/**
	 * Enable themes integration.
	 * This will allow the plugin to use themes in the published notes.
	 *
	 * Themes documentation: {@link https://github.com/saberzero1/quartz-themes}
	 */
	useThemes: boolean;

	/** Plugin state variables */
	noteSettingsIsInitialized: boolean;
	lastUsedSettingsTab: string;
	pluginVersion: string;

	/** Developer settings */
	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
