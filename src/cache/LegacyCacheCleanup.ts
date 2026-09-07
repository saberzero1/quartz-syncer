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
 * The db9905f rename moved DataStore to appId, but status, hub, tree and
 * registry caches still use the vault name. Those are live, not migration
 * leftovers. LightningFS names depend on remote and branch, so their live
 * clones are protected by generation instead of this enumerable set.
 *
 * @param scope - The current vault identities and plugin version.
 * @returns The live database names that cleanup must leave intact.
 */
export function liveCacheNames(scope: CacheScope): Set<string> {
	return new Set([
		`quartz-syncer/cache/${scope.appId}/${scope.pluginId}/${scope.version}`,
		...SCOPED_CACHE_SUFFIXES.map(
			(suffix) => `${scope.vaultName}-${scope.pluginId}-${suffix}`,
		),
	]);
}

/**
 * Recognize abandoned plugin caches without crossing vault boundaries.
 *
 * Matching only the post-db9905f appId prefix orphaned the older vault-name
 * DataStore caches. Both identities are needed, but a plugin-wide prefix
 * would delete other vaults' live caches in the shared IndexedDB origin.
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

	return SCOPED_CACHE_SUFFIXES.some((suffix) => name === `--${suffix}`);
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
	const dropped: string[] = [];
	for (const { name } of instances) {
		if (!name || !isStaleCacheName(name, scope)) continue;

		try {
			await dropStore(name);
			dropped.push(name);
		} catch (error) {
			console.debug(`Failed to drop stale cache "${name}":`, error);
		}
	}

	return dropped;
}
