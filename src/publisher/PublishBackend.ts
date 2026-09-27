import type { DeleteResult, FileChange, TreeEntry } from "src/git/types";

export interface PublishBackend {
	writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<{ sha: string }>;

	deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<DeleteResult>;

	getTree(ref: string): Promise<TreeEntry[]>;

	readBlob(shaOrPath: string): Promise<Uint8Array>;

	readonly isLocal: boolean;

	startPeriodicFetch(intervalSeconds: number): void;

	stopPeriodicFetch(): void;

	invalidateTreeCache(): void;

	refreshTreeCache(): Promise<TreeEntry[]>;

	/** With cacheOnly, return an empty tree on a cache miss instead of reading it. */
	getCachedTree(ref: string, cacheOnly?: boolean): Promise<TreeEntry[]>;
}
