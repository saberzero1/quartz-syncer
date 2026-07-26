/**
 * Quartz configuration types.
 *
 * Mirrors the structure of `quartz.config.yaml` (v5) for type-safe
 * reading, editing, and writing of Quartz site configuration.
 */

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

/** Detected Quartz configuration format. */
export type QuartzVersion = "v5-yaml" | "v5-json" | "v4" | "unknown";

// ---------------------------------------------------------------------------
// Plugin source
// ---------------------------------------------------------------------------

/**
 * Object source format for monorepo-style plugins where the plugin code
 * lives in a subdirectory of a larger repository.
 */
export interface QuartzPluginObjectSource {
	/** Git repository (same formats as string source: `github:org/repo`, etc.) */
	repo: string;
	/** Subdirectory within the repository containing the plugin. */
	subdir?: string;
	/** Git ref (branch or tag) to pin to. Defaults to the default branch. */
	ref?: string;
	/** Override name for the plugin directory. Auto-derived from repo URL if omitted. */
	name?: string;
}

/** Plugin source — either a string shorthand or an object for monorepo plugins. */
export type QuartzPluginSource = string | QuartzPluginObjectSource;

// ---------------------------------------------------------------------------
// Plugin layout
// ---------------------------------------------------------------------------

/** Valid layout positions for component-providing plugins. */
export type QuartzLayoutPosition =
	| "left"
	| "right"
	| "beforeBody"
	| "afterBody"
	| "body";

/** Display modifier controlling viewport visibility. */
export type QuartzDisplayMode = "all" | "mobile-only" | "desktop-only";

/** Per-plugin group options (flex item properties). */
export interface QuartzGroupOptions {
	grow?: boolean;
	shrink?: boolean;
	basis?: string;
	order?: number;
	align?: "start" | "end" | "center" | "stretch";
	justify?: "start" | "end" | "center" | "between" | "around";
}

/** Layout configuration for a component-providing plugin entry. */
export interface QuartzPluginLayout {
	position?: QuartzLayoutPosition;
	priority?: number;
	display?: QuartzDisplayMode;
	condition?: string | null;
	group?: string | null;
	groupOptions?: QuartzGroupOptions | null;
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/** A single entry in the `plugins` array of `quartz.config.yaml`. */
export interface QuartzPluginEntry {
	/** Plugin identifier — string shorthand or object for monorepo plugins. */
	source: QuartzPluginSource;
	/** Whether the plugin is active. */
	enabled: boolean;
	/** Plugin-specific configuration (passed to factory function). */
	options?: Record<string, unknown>;
	/** Execution order within its category (lower = earlier, minimum 0). */
	order?: number;
	/** Layout configuration — only for component-providing plugins. */
	layout?: QuartzPluginLayout;
}

// ---------------------------------------------------------------------------
// Global layout
// ---------------------------------------------------------------------------

/** Flex direction for layout groups. */
export type QuartzFlexDirection =
	| "row"
	| "row-reverse"
	| "column"
	| "column-reverse";

/** Flex wrap for layout groups. */
export type QuartzFlexWrap = "nowrap" | "wrap" | "wrap-reverse";

/** Configuration for a named flex group. */
export interface QuartzFlexGroupConfig {
	priority?: number;
	direction?: QuartzFlexDirection;
	gap?: string;
	wrap?: QuartzFlexWrap;
}

/** Per-page-type layout override. */
export interface QuartzPageTypeOverride {
	/** Template/frame name override for this page type. */
	template?: string;
	/** Plugins to exclude from this page type. */
	exclude?: string[];
	/** Position overrides — maps position name to ordered plugin lists. */
	positions?: Partial<Record<QuartzLayoutPosition, string[]>>;
}

/** Valid page type identifiers for layout overrides. */
export type QuartzPageType =
	| "content"
	| "folder"
	| "tag"
	| "canvas"
	| "bases"
	| "404";

/** Global layout configuration. */
export interface QuartzGlobalLayout {
	/** Named flex group definitions. */
	groups?: Record<string, QuartzFlexGroupConfig>;
	/** Per-page-type overrides. */
	byPageType?: Partial<Record<QuartzPageType, QuartzPageTypeOverride>>;
}

// ---------------------------------------------------------------------------
// Site configuration
// ---------------------------------------------------------------------------

/** Color scheme fields (light or dark mode). */
export interface QuartzColorScheme {
	light: string;
	lightgray: string;
	gray: string;
	darkgray: string;
	dark: string;
	secondary: string;
	tertiary: string;
	highlight: string;
	textHighlight: string;
}

/** Typography configuration. */
export interface QuartzTypography {
	header: string;
	body: string;
	code: string;
}

/** Font origin for theme fonts. */
export type QuartzFontOrigin = "googleFonts" | "local";

/** Theme configuration. */
export interface QuartzThemeConfig {
	fontOrigin: QuartzFontOrigin;
	cdnCaching: boolean;
	typography: QuartzTypography;
	colors: {
		lightMode: QuartzColorScheme;
		darkMode: QuartzColorScheme;
	};
}

/** Analytics provider configuration. */
export interface QuartzAnalyticsConfig {
	provider: string;
	[key: string]: unknown;
}

/** The `configuration` object in `quartz.config.yaml`. */
export interface QuartzSiteConfiguration {
	pageTitle: string;
	pageTitleSuffix?: string;
	enableSPA: boolean;
	enablePopovers?: boolean;
	analytics?: QuartzAnalyticsConfig;
	locale: string;
	baseUrl?: string;
	ignorePatterns?: string[];
	theme: QuartzThemeConfig;
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

/** Parsed representation of a `quartz.config.yaml` (or `quartz.plugins.json`). */
export interface QuartzV5Config {
	configuration: QuartzSiteConfiguration;
	plugins: QuartzPluginEntry[];
	layout?: QuartzGlobalLayout;
}

// ---------------------------------------------------------------------------
// Lock file
// ---------------------------------------------------------------------------

/** A single entry in `quartz.lock.json`. */
export interface QuartzLockFileEntry {
	/** Matches the source from `quartz.config.yaml`. */
	source: QuartzPluginSource;
	/** Resolved git URL (always full HTTPS). */
	resolved: string;
	/** Pinned commit hash. */
	commit: string;
	/** ISO 8601 timestamp of when the plugin was installed. */
	installedAt: string;
	/** Subdirectory path, present when source is an object. */
	subdir?: string;
}

/** Parsed representation of `quartz.lock.json`. */
export interface QuartzLockFile {
	version: string;
	plugins: Record<string, QuartzLockFileEntry>;
}

// ---------------------------------------------------------------------------
// Plugin manifest (package.json `quartz` field) — read-only
// ---------------------------------------------------------------------------

/** Component metadata from a plugin manifest. */
export interface QuartzManifestComponent {
	displayName?: string;
	defaultPosition?: QuartzLayoutPosition;
	defaultPriority?: number;
}

/** Frame metadata from a plugin manifest. */
export interface QuartzManifestFrame {
	exportName: string;
}

/** Plugin category. */
export type QuartzPluginCategory =
	| "transformer"
	| "filter"
	| "emitter"
	| "pageType"
	| "component";

/** The `quartz` field from a plugin's `package.json`. */
export interface QuartzPluginManifest {
	name: string;
	displayName?: string;
	description?: string;
	category: QuartzPluginCategory | QuartzPluginCategory[];
	version?: string;
	quartzVersion?: string;
	dependencies?: string[];
	defaultOrder?: number;
	defaultEnabled?: boolean;
	defaultOptions?: Record<string, unknown>;
	optionSchema?: Record<string, unknown>;
	/** Also check `configSchema` for forward compatibility. */
	configSchema?: Record<string, unknown>;
	components?: Record<string, QuartzManifestComponent>;
	frames?: Record<string, QuartzManifestFrame>;
	keywords?: string[];
	requiresInstall?: boolean;
}
