/**
 * Abstraction for reading/writing files from a Quartz repository.
 *
 * Two implementations:
 * - RemoteFileSource: reads from git remote via BundledGitBackend (desktop + mobile)
 * - LocalFileSource: reads/writes from local disk (desktop only)
 */
export interface QuartzFileSource {
	readFile(path: string): Promise<string | null>;
	/**
	 * Read several files in one round trip. Optional; use `readFilesFrom` so a
	 * caller need not care whether an implementation provides it.
	 */
	readFiles?(paths: string[]): Promise<(string | null)[]>;
	writeFile(path: string, content: string): Promise<void>;
	writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
	deleteFile(path: string): Promise<void>;
	listDirectory(path: string): Promise<QuartzDirectoryEntry[]>;
	listAllFiles(basePath?: string): Promise<string[]>;
	exists(path: string): Promise<boolean>;
}

export interface QuartzDirectoryEntry {
	name: string;
	type: "blob" | "tree";
}

/**
 * Read several files, batched when the source supports it.
 *
 * Prefer this over a loop of `readFile`: against a remote each read is a
 * network request, so a sequential probe of N candidate paths costs N round
 * trips where one would do.
 */
export async function readFilesFrom(
	source: QuartzFileSource,
	paths: string[],
): Promise<(string | null)[]> {
	if (source.readFiles) {
		try {
			return await source.readFiles(paths);
		} catch {
			// Fall through: a batch is all-or-nothing, but callers probing for
			// optional files still need a per-path answer.
		}
	}

	// Each path is isolated so one unreadable candidate cannot mask the others.
	return Promise.all(
		paths.map(async (path) => {
			try {
				return await source.readFile(path);
			} catch {
				return null;
			}
		}),
	);
}
