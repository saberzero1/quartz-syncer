import { dropStore } from "src/cache/IndexedDBStore";
import {
	GIT_FS_GENERATION,
	parseGitFsGeneration,
} from "src/git/backends/GitFsName";

/**
 * Keep both vault identities so cleanup can reach caches from before the
 * db9905f rename without treating another vault's appId as our own.
 */
export interface CacheScope {
	appId: string;
	vaultName: string;
	pluginId: string;
	version: string;
}

const SCOPED_CACHE_SUFFIXES = ["status", "hub", "tree", "registry"];

/**
 * Protect the databases still read and written by this plugin scope.
 *
 * DataStore and the status, hub, tree and registry caches now all use appId;
 * their vault-name copies are migration leftovers, not live data.
 * LightningFS names depend on remote and branch, so their live clones are
 * protected by generation instead of this enumerable set.
 *
 * @param scope - The current vault identities and plugin version.
 * @returns The live database names that cleanup must leave intact.
 */
export function liveCacheNames(scope: CacheScope): Set<string> {
	return new Set([
		`quartz-syncer/cache/${scope.appId}/${scope.pluginId}/${scope.version}`,
		...SCOPED_CACHE_SUFFIXES.map(
			(suffix) => `${scope.appId}-${scope.pluginId}-${suffix}`,
		),
	]);
}

/**
 * Recognize abandoned plugin caches without crossing vault boundaries.
 *
 * Matching only the post-db9905f appId prefix orphaned the older vault-name
 * DataStore caches. Both identities are needed, but a plugin-wide prefix
 * would delete other vaults' live caches in the shared IndexedDB origin.
 * Service caches have also moved to appId, leaving vault-name copies behind.
 * Only this vault's non-empty name is reclaimable: other vaults may still
 * use their name-keyed caches with an older plugin build.
 * Hash-only LightningFS clones have no vault identity and no current reader;
 * current and future generations must survive regardless of their appId.
 * Empty-scope service databases are placeholder junk, not scoped caches.
 *
 * @param name - The IndexedDB database name to classify.
 * @param scope - The current vault identities and plugin version.
 * @returns Whether the database is a stale cache safe to drop.
 */
export function isStaleCacheName(name: string, scope: CacheScope): boolean {
	if (liveCacheNames(scope).has(name)) return false;

	if (name.startsWith("quartz-syncer/cache/")) {
		const segments = name.split("/");
		return (
			segments.length === 5 &&
			segments[3] === scope.pluginId &&
			(segments[2] === scope.appId || segments[2] === scope.vaultName)
		);
	}

	const generation = parseGitFsGeneration(name);
	if (generation !== null && generation < GIT_FS_GENERATION) return true;

	return SCOPED_CACHE_SUFFIXES.some(
		(suffix) =>
			name === `--${suffix}` ||
			(scope.vaultName !== "" &&
				name === `${scope.vaultName}-${scope.pluginId}-${suffix}`),
	);
}

/**
 * Recognize every plugin cache family without assuming which vault owns it.
 * Explicit cleanup needs this broader boundary to reclaim deleted or renamed
 * vaults' derived data while leaving other plugins' databases untouched.
 */
export function isPluginCacheName(name: string, pluginId: string): boolean {
	if (name.startsWith("quartz-syncer/cache/")) {
		const segments = name.split("/");
		return segments.length === 5 && segments[3] === pluginId;
	}

	if (parseGitFsGeneration(name) !== null) return true;

	return SCOPED_CACHE_SUFFIXES.some(
		(suffix) =>
			name === `--${suffix}` || name.endsWith(`-${pluginId}-${suffix}`),
	);
}

/**
 * Survey candidates without deleting anything so a user can review exact names.
 * This is the explicit-consent counterpart to the automatic sweep: it deliberately
 * includes other vaults' live caches. Deleting those is safe only with human
 * confirmation and because every database is rebuildable derived data.
 * The current vault's live databases, including remote-dependent clones supplied
 * through liveExtra, are protected; sorting keeps the review list stable.
 */
export async function surveyForeignCaches(
	scope: CacheScope,
	liveExtra: readonly string[] = [],
): Promise<string[]> {
	if (typeof indexedDB === "undefined" || !indexedDB.databases) return [];

	const live = new Set([...liveCacheNames(scope), ...liveExtra]);
	const instances = await indexedDB.databases();
	return instances
		.map(({ name }) => name)
		.filter(
			(name): name is string =>
				typeof name === "string" &&
				isPluginCacheName(name, scope.pluginId) &&
				!live.has(name),
		)
		.sort();
}

/**
 * Delete exactly the approved names, sequentially to avoid request contention.
 * One rejection must not prevent reclaiming the remaining derived caches, and
 * callers need both outcomes to report partial cleanup rather than silent success.
 * The optional failure label preserves the automatic sweep's existing diagnostics
 * while sharing its deletion loop with explicit cleanup.
 */
export async function dropCaches(
	names: readonly string[],
	failureLabel: "cache" | "stale cache" = "cache",
): Promise<{ dropped: string[]; failed: string[] }> {
	const dropped: string[] = [];
	const failed: string[] = [];
	for (const name of names) {
		try {
			await dropStore(name);
			dropped.push(name);
		} catch (error) {
			failed.push(name);
			console.debug(`Failed to drop ${failureLabel} "${name}":`, error);
		}
	}
	return { dropped, failed };
}

/**
 * Reclaim caches stranded by the db9905f namespace rename and older layouts.
 *
 * IndexedDB is shared across vaults, so only names classified as stale for
 * this scope may be removed. Cleanup is best-effort: unavailable enumeration
 * must not prevent startup, and one blocked or failed deletion must not
 * prevent the remaining abandoned caches from being reclaimed. Sequential
 * deletion avoids contention between IndexedDB requests.
 *
 * @param scope - The current vault identities and plugin version.
 * @returns The names whose dropStore calls completed without rejection.
 */
export async function dropStaleCaches(scope: CacheScope): Promise<string[]> {
	if (typeof indexedDB === "undefined" || !indexedDB.databases) return [];

	const instances = await indexedDB.databases();
	const names = instances
		.map(({ name }) => name)
		.filter(
			(name): name is string => !!name && isStaleCacheName(name, scope),
		);
	const { dropped } = await dropCaches(names, "stale cache");

	return dropped;
}
