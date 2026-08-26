import type { Publisher } from "src/publisher/Publisher";
import type {
	PublishProgressCallback,
	PublishResult,
	PublishStatus,
} from "src/publisher/types";
import type { PublishFile } from "src/publishFile/PublishFile";

export class PublicationService {
	constructor(private publisher: Publisher) {}

	async getStatus(): Promise<PublishStatus> {
		return this.publisher.getPublishStatus();
	}

	async publish(
		files: PublishFile[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		return this.publisher.publishBatch(
			files,
			message ?? "Published via Quartz Syncer",
			onProgress,
		);
	}

	async delete(
		paths: string[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		return this.publisher.deleteBatch(
			paths,
			message ?? "Deleted via Quartz Syncer",
			onProgress,
		);
	}

	async deleteByRepoPaths(
		repoPaths: string[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		return this.publisher.deleteByRepoPaths(
			repoPaths,
			message ?? "Deleted via Quartz Syncer",
			onProgress,
		);
	}

	async publishArbitraryFiles(
		files: Array<{
			repoPath: string;
			content: string | Uint8Array;
			encoding: "utf-8" | "base64";
		}>,
		message?: string,
	): Promise<PublishResult> {
		return this.publisher.publishArbitraryFiles(
			files,
			message ?? "Published via Quartz Syncer",
		);
	}

	async cleanOrphanedMedia(): Promise<void> {
		await this.publisher.cleanOrphanedMedia();
	}

	get isLocal(): boolean {
		return this.publisher.isLocal;
	}
}
