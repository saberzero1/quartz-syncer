import { ILogLevel } from "js-logger";

/**
 * Git authentication configuration.
 * Used as a data transfer type for RepositoryConnection and related services.
 * Not stored directly in settings — constructed from flat keys via getGitSettingsWithSecret().
 */
export type GitAuthType = "none" | "basic" | "bearer";

export interface GitAuth {
	type: GitAuthType;
	/** Username for basic auth (e.g., GitHub username, 'oauth2' for GitLab) */
	username?: string;
	/** Secret token/password for authentication (from SecretStorageService, not persisted in settings) */
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

export type UpgradeCheckStrategy = "version" | "commit";

export type FrontmatterFormat = "yaml" | "json";

/**
 * Git remote settings as a data transfer type.
 * Used by RepositoryConnection, SiteManager, and related services.
 * Constructed from flat settings keys via getGitSettingsWithSecret().
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
 * Saved to data.json. All keys are flat (top-level) for compatibility with the
 * Obsidian 1.13 declarative settings API (getSettingDefinitions).
 */
export default interface QuartzSyncerSettings {
	/** Settings schema version for data migrations */
	settingsSchemaVersion: number;

	/** Git remote URL (e.g., https://github.com/username/quartz.git) */
	gitRemoteUrl: string;
	/** Git branch to sync with */
	gitBranch: string;
	/** CORS proxy URL for browser environments (optional) */
	gitCorsProxyUrl: string;
	/** Git authentication type */
	gitAuthType: GitAuthType;
	/** Git username for basic auth */
	gitAuthUsername: string;
	/** Git provider hint for UI customization */
	gitProviderHint: GitProviderHint;

	/** Vault path settings */
	vaultPath: string;

	/**
	 * @deprecated Use gitRemoteUrl instead. Kept for migration from pre-v4.
	 */
	githubRepo?: string;
	/**
	 * @deprecated Use gitAuthUsername instead. Kept for migration from pre-v4.
	 */
	githubUserName?: string;
	/**
	 * @deprecated Use SecretStorageService instead. Kept for migration from pre-v4.
	 */
	githubToken?: string;

	/**
	 * @deprecated Use flat git* keys instead. Kept for migration from schema v1.
	 */
	git?: GitRemoteSettings;

	/** Quartz settings */
	contentFolder: string;

	/** Frontmatter settings */
	publishFrontmatterKey: string;
	allNotesPublishableByDefault: boolean;
	showCreatedTimestamp: boolean;
	showUpdatedTimestamp: boolean;
	showPublishedTimestamp: boolean;
	usePermalink: boolean;

	includeAllFrontmatter: boolean;

	/**
	 * Output format for frontmatter in published notes.
	 * - "yaml": Output frontmatter as YAML (default, more readable)
	 * - "json": Output frontmatter as JSON (legacy behavior)
	 */
	frontmatterFormat: FrontmatterFormat;

	/**
	 * @privateRemarks
	 *
	 * These values are not configurable, but are the defaults in Quartz.
	 * They are included here in case the user wants to change them.
	 * Or to nake it easier to adapt the plugin to future changes in Quartz.
	 */
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
	 * Enable Datacore integration.
	 * This will allow the plugin to use Datacore queries in the published notes.
	 *
	 * Datacore documentation: {@link https://blacksmithgu.github.io/datacore/}
	 */
	useDatacore: boolean;
	/**
	 * Enable Excalidraw integration.
	 * This will sync Excalidraw drawings (`.excalidraw.md` files) to Quartz as-is.
	 * Rendering is handled by the Quartz Excalidraw plugin.
	 *
	 * Excalidraw Obsidian plugin: {@link https://excalidraw-obsidian.online/wiki/welcome}
	 * Quartz Excalidraw plugin: {@link https://github.com/quartz-community/obsidian-plugin-excalidraw}
	 */
	useExcalidraw: boolean;
	/**
	 * Enable Fantasy Statblocks integration.
	 * This will allow the plugin to use Fantasy Statblocks queries in the published notes.
	 *
	 * Fantasy Statblocks documentation: {@link https://plugins.javalent.com/statblocks}
	 */
	useFantasyStatblocks: boolean;
	/**
	 * Enable Bases integration.
	 * This will allow the plugin to publish Obsidian Bases (.base files) to Quartz.
	 *
	 * Bases documentation: {@link https://help.obsidian.md/bases}
	 */
	useBases: boolean;
	/**
	 * Enable Canvas integration.
	 * This will allow the plugin to publish JSON Canvas (.canvas files) to Quartz.
	 *
	 * Canvas documentation: {@link https://jsoncanvas.org/}
	 */
	useCanvas: boolean;

	/** Manage integration styles in Quartz (writes SCSS files and updates custom.scss) */
	manageSyncerStyles: boolean;

	/** Plugin state variables */
	noteSettingsIsInitialized: boolean;
	lastUsedSettingsTab: string;
	pluginVersion: string;

	/** Last known upstream Quartz commit SHA (per-device, for commit-based update checks) */
	lastUpstreamCommitSha: string;

	/** Strategy for checking Quartz updates: "version" compares package versions, "commit" compares upstream commit SHAs */
	upgradeCheckStrategy: UpgradeCheckStrategy;

	/** UI settings */
	diffViewStyle: DiffViewStyle;

	/** Developer settings */
	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
