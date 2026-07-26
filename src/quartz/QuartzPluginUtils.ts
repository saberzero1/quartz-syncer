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
