import type { PublishFile } from "src/publishFile/PublishFile";

export interface PublishStatus {
	unpublished: PublishFile[];
	changed: PublishFile[];
	published: PublishFile[];
	deleted: string[];
}

export interface PublishResult {
	success: boolean;
	commitSha?: string;
	filesPublished: number;
	filesDeleted: number;
	error?: string;
}
