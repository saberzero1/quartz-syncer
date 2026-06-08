/**
 * File ownership classification for Quartz upgrade merge conflict resolution.
 *
 * During upstream upgrades, files are classified as either "user-owned" (preserve
 * the user's version) or "framework" (accept upstream changes). This distinction
 * drives the preflight gate, merge driver, and post-merge restore phases.
 *
 * Note: QUARTZ_SYNCER_V5.md lists quartz.ts as upstream-owned, but users can
 * customize it in practice. The classification below reflects actual usage.
 */

export const USER_OWNED_FILES = new Set([
	"quartz.config.yaml",
	"quartz.lock.json",
	"quartz.ts",
	"quartz/styles/custom.scss",
]);

const USER_OWNED_PREFIXES = [
	"content/",
	".github/",
	"quartz/static/",
	"quartz/styles/syncer/",
];

const SAFE_TO_OVERWRITE_FILES = new Set(["quartz.config.default.yaml"]);

/**
 * Returns true if the given filepath belongs to the user (should be preserved
 * during upstream merges), false if it's a framework file (should accept
 * upstream changes).
 */
export function isUserOwnedPath(filepath: string): boolean {
	if (USER_OWNED_FILES.has(filepath)) return true;

	return USER_OWNED_PREFIXES.some((prefix) => filepath.startsWith(prefix));
}

/**
 * Returns true if the filepath should be excluded from the preflight
 * framework-modification check. These are files that may diverge between
 * the user's fork and the merge base, but are safe to overwrite with
 * upstream's version (they're not user-customized, just stale).
 */
export function isPreflightExempt(filepath: string): boolean {
	return isUserOwnedPath(filepath) || SAFE_TO_OVERWRITE_FILES.has(filepath);
}
