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
}

export interface PublishResult {
	success: boolean;
	commitSha?: string;
	filesPublished: number;
	filesDeleted: number;
	error?: string;
}
