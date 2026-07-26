import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createSyncHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		const publishFiles = [...status.unpublished, ...status.changed];
		const deletePaths = status.deleted;

		let published = 0;
		let deleted = 0;
		let publishSha: string | undefined;
		let deleteSha: string | undefined;

		if (publishFiles.length > 0) {
			const publishResult = await publisher.publishBatch(
				publishFiles,
				"Published via Quartz Syncer CLI",
			);
			if (!publishResult.success) {
				return {
					success: false,
					error: publishResult.error ?? "Publish failed",
				};
			}
			published = publishResult.filesPublished;
			publishSha = publishResult.commitSha;
		}

		if (deletePaths.length > 0) {
			const deleteResult = await publisher.deleteBatch(
				deletePaths,
				"Deleted via Quartz Syncer CLI",
			);
			if (!deleteResult.success) {
				return {
					success: false,
					error: deleteResult.error ?? "Delete failed",
				};
			}
			deleted = deleteResult.filesDeleted;
			deleteSha = deleteResult.commitSha;
		}

		return {
			success: true,
			data: {
				published,
				deleted,
				publishSha,
				deleteSha,
			},
		};
	};
}
