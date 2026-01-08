import { ILogLevel } from "js-logger";

/**
 * Git authentication configuration.
 * Supports multiple authentication methods for different Git providers.
 */
export type GitAuthType = "none" | "basic" | "bearer";

export interface GitAuth {
	type: GitAuthType;
	/** Username for basic auth (e.g., GitHub username, 'oauth2' for GitLab) */
	username?: string;
	/** Secret token/password for authentication */
	secret?: string;
}

/**
 * Git provider hints for UI customization.
 * Used to provide provider-specific guidance in the settings UI.
 */
export type GitProviderHint =
	| "github"
	| "gitlab"
	| "bitbucket"
	| "gitea"
	| "custom";

export type DiffViewStyle = "split" | "unified" | "auto";

/**
 * Generic Git remote settings.
 * Works with any Git provider (GitHub, GitLab, Bitbucket, self-hosted, etc.)
 */
export interface GitRemoteSettings {
	/** Full remote URL (e.g., https://github.com/user/repo.git) */
	remoteUrl: string;
	/** Branch to sync with (e.g., main, master) */
	branch: string;
	/** CORS proxy URL for browser environments (optional) */
	corsProxyUrl?: string;
	/** Authentication configuration */
	auth: GitAuth;
	/** Provider hint for UI customization (optional) */
	providerHint?: GitProviderHint;
}

/**
 * QuartzSyncer plugin settings.
 * Saved to data.json, changing requires a migration
 */
export default interface QuartzSyncerSettings {
	/** Git remote settings (generic, works with any provider) */
	git: GitRemoteSettings;

	/** Vault path settings */
	vaultPath: string;

	/**
	 * @deprecated Use git.remoteUrl instead. Kept for migration.
	 */
	githubRepo?: string;
	/**
	 * @deprecated Use git.auth.username instead. Kept for migration.
	 */
	githubUserName?: string;
	/**
	 * @deprecated Use git.auth.secret instead. Kept for migration.
	 */
	githubToken?: string;

	/** Quartz settings */
	contentFolder: string;
	useFullResolutionImages: boolean;
	applyEmbeds: boolean;

	/** Frontmatter settings */
	publishFrontmatterKey: string;
	allNotesPublishableByDefault: boolean;
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
	 * Enable Auto Card Link integration.
	 * This will allow the plugin to use Auto Card Link queries in the published notes.
	 *
	 * Auto Card Link documentation: {@link https://github.com/nekoshita/obsidian-auto-card-link}
	 */
	useAutoCardLink: boolean;
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
	 * Enable Fantasy Statblocks integration.
	 * This will allow the plugin to use Fantasy Statblocks queries in the published notes.
	 *
	 * Fantasy Statblocks documentation: {@link https://plugins.javalent.com/statblocks}
	 */
	useFantasyStatblocks: boolean;

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

	/** UI settings */
	diffViewStyle: DiffViewStyle;

	/** Developer settings */
	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
