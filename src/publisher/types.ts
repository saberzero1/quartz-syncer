import type { PublishFile } from "src/publishFile/PublishFile";

export type PublishProgressCallback = (current: number, total: number) => void;

export interface MediaEntry {
	repoPath: string;
	vaultPath: string;
	sha: string;
	size?: number;
	linked: boolean;
}

export interface ArbitraryFileEntry {
	vaultPath: string;
	repoPath: string;
	status: "unpublished" | "published" | "changed";
	sha?: string;
}

export interface PublishStatus {
	unpublished: PublishFile[];
	changed: PublishFile[];
	published: PublishFile[];
	deleted: string[];
	media: MediaEntry[];
	arbitrary: ArbitraryFileEntry[];
	mediaLinks?: Map<string, string[]>;
	/**
	 * Vault paths whose output depends on the wider vault and therefore cannot
	 * be classified from a durable hash. An unknown classification is included
	 * here, matching the safe direction used throughout the cache layer.
	 */
	dynamic?: Set<string>;
}

export interface PublishFailure {
	vaultPath: string;
	error: string;
}

export interface PublishResult {
	success: boolean;
	/**
	 * Every selected file already matched the remote, so no commit was made.
	 * Distinguishes "nothing to do" from "published", which an empty commit
	 * sha alone does not.
	 */
	unchanged?: boolean;
	commitSha?: string;
	filesPublished: number;
	filesDeleted: number;
	error?: string;
	failures?: PublishFailure[];
}
