/**
 * Bump to orphan every existing clone when the on-disk layout changes.
 * Cleanup shares this constant so it never deletes a clone current code uses,
 * without importing the Git transport or LightningFS itself.
 */
export const GIT_FS_GENERATION = 2;

/**
 * Build the LightningFS database name for a repository clone.
 *
 * IndexedDB is scoped per Obsidian installation, not per vault, so `appId` is
 * required: without it two vaults sharing a remote and branch would share one
 * working tree and could clobber each other's staged commits.
 *
 * @param appId - Obsidian's per-vault identifier.
 * @param remoteUrl - The Git remote URL.
 * @param branch - The Git branch name.
 * @returns The IndexedDB database name.
 */
export function buildFsName(
	appId: string,
	remoteUrl: string,
	branch: string,
): string {
	let hash = 0;
	const str = remoteUrl + branch;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}

	return `quartz-syncer-${GIT_FS_GENERATION}-${appId}-${Math.abs(hash).toString(36)}`;
}

/**
 * Identify the clone layout without opening its LightningFS database.
 *
 * Legacy hash-only names predate vault isolation and encode no generation;
 * treating them as generation 1 makes those abandoned clones reachable for
 * cleanup. The appId is deliberately greedy because vault identifiers may
 * contain hyphens. Unrelated namespaces must not become cleanup candidates.
 *
 * @param name - The IndexedDB database name.
 * @returns The clone generation, or null for a name outside this family.
 */
export function parseGitFsGeneration(name: string): number | null {
	const prefix = "quartz-syncer-";
	if (!name.startsWith(prefix)) return null;

	const rest = name.substring(prefix.length);
	if (/^[0-9a-z]+$/.test(rest)) return 1;

	const match = /^(\d+)-(.+)-([0-9a-z]+)$/.exec(rest);
	return match?.[1] === undefined ? null : parseInt(match[1], 10);
}
