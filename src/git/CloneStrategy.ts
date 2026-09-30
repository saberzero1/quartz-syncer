/**
 * Decide how to clone a repository the server may or may not be able to filter.
 *
 * Kept free of network and Obsidian imports so every branch is testable.
 */
export type CloneStrategy =
	| { kind: "blobless" }
	| { kind: "full" }
	| { kind: "refuse"; reason: string };

/**
 * Above this, a full clone is the failure reported in issue #136: the whole
 * repository is buffered in Obsidian's main process, which cannot stream.
 */
export const FULL_CLONE_LIMIT_BYTES = 128 * 1024 * 1024;

export interface CloneStrategyOptions {
	/** Set by the user to accept a slow, memory-hungry clone. */
	allowLargeFullClone?: boolean;
}

function formatBytes(bytes: number): string {
	const mib = bytes / (1024 * 1024);

	return mib >= 1024
		? `${(mib / 1024).toFixed(1)} GB`
		: `${Math.round(mib)} MB`;
}

const OVERRIDE_HINT =
	'Enable "Allow large full clones" in Quartz Syncer settings to download it anyway.';

/**
 * @param capabilities - Capabilities advertised by the remote.
 * @param sizeBytes - Repository size if the provider reports one, else null.
 */
export function resolveCloneStrategy(
	capabilities: Iterable<string>,
	sizeBytes: number | null,
	options: CloneStrategyOptions = {},
): CloneStrategy {
	if (new Set(capabilities).has("filter")) {
		return { kind: "blobless" };
	}

	if (options.allowLargeFullClone) return { kind: "full" };

	// Surfaced rather than waved through. Without partial clone there is no way
	// to bound the download, and `requestUrl` cannot stream, so an unmeasured
	// repository is exactly where this fails silently. Refusing is only
	// reasonable because the user can opt back into the old behaviour.
	if (sizeBytes === null) {
		return {
			kind: "refuse",
			reason: `This Git server does not support partial clone, and the repository size could not be determined, so Quartz Syncer cannot tell whether downloading it whole is safe. ${OVERRIDE_HINT}`,
		};
	}

	if (sizeBytes > FULL_CLONE_LIMIT_BYTES) {
		return {
			kind: "refuse",
			reason: `This repository is ${formatBytes(sizeBytes)} and the Git server does not support partial clone, so it would have to be downloaded whole. ${OVERRIDE_HINT}`,
		};
	}

	return { kind: "full" };
}
