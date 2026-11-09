/**
 * Utility functions for working with Quartz plugin source identifiers.
 *
 * Handles both string sources (e.g. `"github:quartz-community/explorer"`)
 * and object sources (e.g. `{ repo: "github:saberzero1/quartz-themes", subdir: "plugin" }`).
 */

import type {
	QuartzPluginObjectSource,
	QuartzPluginSource,
} from "./QuartzConfigTypes";

/**
 * Type guard — returns `true` if `source` is an object source (has a `repo` field).
 */
export function isObjectSource(
	source: QuartzPluginSource,
): source is QuartzPluginObjectSource {
	return (
		typeof source === "object" &&
		source !== null &&
		"repo" in source &&
		typeof source.repo === "string"
	);
}

/**
 * Extract a human-readable plugin name from a source specifier.
 *
 * @example
 * ```
 * getPluginName("github:quartz-community/explorer")        // "explorer"
 * getPluginName("github:quartz-community/explorer#v2")     // "explorer"
 * getPluginName("git+https://github.com/user/my-plugin.git") // "my-plugin"
 * getPluginName({ repo: "github:saberzero1/quartz-themes", name: "quartz-themes" }) // "quartz-themes"
 * getPluginName({ repo: "github:saberzero1/quartz-themes", subdir: "plugin" })      // "quartz-themes"
 * ```
 */
export function getPluginName(source: QuartzPluginSource): string {
	if (isObjectSource(source)) {
		if (source.name) return source.name;

		return extractNameFromSourceString(source.repo);
	}

	return extractNameFromSourceString(source);
}

/**
 * Create a stable key for comparing/deduplicating plugins.
 * Strips ref pins and normalizes to a canonical form.
 *
 * For object sources, includes the subdir to distinguish monorepo plugins
 * that share the same repository.
 *
 * @example
 * ```
 * getPluginSourceKey("github:org/repo#v2")   // "github:org/repo"
 * getPluginSourceKey({ repo: "github:org/repo", subdir: "plugin" }) // "github:org/repo::plugin"
 * ```
 */
export function getPluginSourceKey(source: QuartzPluginSource): string {
	if (isObjectSource(source)) {
		const repoKey = stripRef(source.repo);

		return source.subdir ? `${repoKey}::${source.subdir}` : repoKey;
	}

	return stripRef(source);
}

/**
 * Resolve a source specifier to a full git HTTPS URL.
 * Used for `listServerRefs` and other remote git operations.
 *
 * @example
 * ```
 * resolveSourceToGitUrl("github:org/repo")            // "https://github.com/org/repo.git"
 * resolveSourceToGitUrl("github:org/repo#v2")         // "https://github.com/org/repo.git"
 * resolveSourceToGitUrl("git+https://example.com/r.git") // "https://example.com/r.git"
 * resolveSourceToGitUrl({ repo: "github:org/repo" })  // "https://github.com/org/repo.git"
 * ```
 */
export function resolveSourceToGitUrl(source: QuartzPluginSource): string {
	const raw = isObjectSource(source) ? source.repo : source;
	const withoutRef = stripRef(raw);

	// github:org/repo → https://github.com/org/repo.git
	if (withoutRef.startsWith("github:")) {
		const path = withoutRef.slice("github:".length);

		return `https://github.com/${path}.git`;
	}

	// git+https://... → https://...
	if (withoutRef.startsWith("git+")) {
		return withoutRef.slice("git+".length);
	}

	// Already a full URL
	return withoutRef;
}

/**
 * Get the pinned ref from a source, if any.
 *
 * @example
 * ```
 * getSourceRef("github:org/repo#v2")       // "v2"
 * getSourceRef("github:org/repo")           // undefined
 * getSourceRef({ repo: "github:org/repo", ref: "main" }) // "main"
 * ```
 */
export function getSourceRef(source: QuartzPluginSource): string | undefined {
	if (isObjectSource(source)) {
		return source.ref;
	}

	const hashIndex = source.indexOf("#");

	return hashIndex !== -1 ? source.slice(hashIndex + 1) : undefined;
}

// ---------------------------------------------------------------------------
/**
 * A canonical key for "is this the same plugin?" across the spellings a source can have.
 *
 * GitHub sources (`github:org/repo`, `org/repo`, `https://github.com/org/repo.git`,
 * `git+https://github.com/org/repo.git`, with or without `#ref`) become `github:org/repo`; npm
 * package names (`@scope/name`, `@scope/name@1.2.3`) become `@scope/name`. Case is ignored.
 * Object sources use their `repo`, plus `::subdir` for monorepo plugins.
 *
 * @example
 * ```
 * canonicalPluginKey("https://github.com/Quartz-Community/explorer.git#v2") // "github:quartz-community/explorer"
 * canonicalPluginKey("quartz-community/explorer")                          // "github:quartz-community/explorer"
 * canonicalPluginKey("@quartz-community/explorer@1.0.3")                   // "@quartz-community/explorer"
 * ```
 */
export function canonicalPluginKey(source: QuartzPluginSource): string {
	if (isObjectSource(source)) {
		const repoKey = canonicalPluginKey(source.repo);

		return source.subdir ? `${repoKey}::${source.subdir}` : repoKey;
	}

	const raw = stripRef(source).trim();
	const npm = /^(@[^/\s]+\/[^/@\s]+)(?:@.*)?$/.exec(raw);
	if (npm?.[1]) return npm[1].toLowerCase();

	const github =
		/^(?:github:|(?:git\+)?https?:\/\/(?:www\.)?github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(
			raw,
		);
	if (
		github?.[1] &&
		github[2] &&
		!raw.startsWith(".") &&
		!raw.startsWith("/")
	) {
		return `github:${github[1]}/${github[2]}`.toLowerCase();
	}

	return raw;
}

/**
 * Whether a configured plugin source is the plugin a registry entry describes. A registry entry
 * names both its install `source` (often the npm package) and its GitHub `repo`, and a config may
 * use either: `@quartz-community/quartz-fonts` and `github:quartz-community/fonts` are the same
 * plugin.
 */
export function isSamePluginAsRegistryEntry(
	configSource: QuartzPluginSource,
	entry: { source: string; repo?: string },
): boolean {
	const key = canonicalPluginKey(configSource);
	const candidates = [entry.source, entry.repo].filter(
		(s): s is string => typeof s === "string" && s.length > 0,
	);

	return candidates.some(
		(candidate) => canonicalPluginKey(candidate) === key,
	);
}

// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strip the `#ref` suffix from a source string.
 */
function stripRef(source: string): string {
	const hashIndex = source.indexOf("#");

	return hashIndex !== -1 ? source.slice(0, hashIndex) : source;
}

/**
 * Extract a human-readable name from a source string.
 *
 * Handles:
 * - `github:org/repo`           → `repo`
 * - `github:org/repo#ref`       → `repo`
 * - `git+https://host/org/repo.git` → `repo`
 * - `https://host/org/repo.git` → `repo`
 * - `/local/path/to/plugin`     → `plugin`
 */
function extractNameFromSourceString(source: string): string {
	const withoutRef = stripRef(source);

	// github:org/repo
	if (withoutRef.startsWith("github:")) {
		const path = withoutRef.slice("github:".length);
		const parts = path.split("/");

		return parts[parts.length - 1] || path;
	}

	// git+https:// or https:// URLs
	if (withoutRef.includes("://")) {
		try {
			const url = new URL(withoutRef.replace(/^git\+/, ""));
			const pathname = url.pathname.replace(/\.git$/, "");
			const parts = pathname.split("/").filter(Boolean);

			return parts[parts.length - 1] || pathname;
		} catch {
			// Fall through to path-based extraction
		}
	}

	// Local path or unknown format — use last segment
	const parts = withoutRef.split("/").filter(Boolean);

	return parts[parts.length - 1] || withoutRef;
}
