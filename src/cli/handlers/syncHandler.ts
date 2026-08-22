import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createSyncHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		const publishFiles = [...status.unpublished, ...status.changed];
		const publishPaths = publishFiles.map((file) => file.getVaultPath());
		const deletePaths = status.deleted;
		const includeDeletes = params.flags.has("force");
		const warning = includeDeletes
			? undefined
			: "Skipped deletions. Use 'force' to include deletions.";

		if (params.flags.has("dry-run")) {
			return {
				success: true,
				data: {
					published: publishPaths,
					deleted: includeDeletes ? deletePaths : [],
					...(warning ? { warning } : {}),
				},
			};
		}

		let published = 0;
		let deleted = 0;
		let publishSha: string | undefined;
		let deleteSha: string | undefined;
		const publishMessage =
			params.args.message ?? "Published via Quartz Syncer CLI";
		const deleteMessage = params.args.message
			? `${params.args.message} (deletions)`
			: "Deleted via Quartz Syncer CLI";

		if (publishFiles.length > 0) {
			const publishResult = await publisher.publishBatch(
				publishFiles,
				publishMessage,
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

		if (includeDeletes && deletePaths.length > 0) {
			const deleteResult = await publisher.deleteBatch(
				deletePaths,
				deleteMessage,
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
				...(warning ? { warning } : {}),
				...(params.verbose
					? {
							files: {
								published: publishPaths,
								deleted: includeDeletes ? deletePaths : [],
							},
						}
					: {}),
			},
		};
	};
}
