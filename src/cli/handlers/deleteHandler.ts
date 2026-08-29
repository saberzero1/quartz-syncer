import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createDeleteHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		if (!params.flags.has("force")) {
			return {
				success: false,
				error: "Destructive operation requires the 'force' flag.",
			};
		}

		const status = await publisher.getPublishStatus();
		const deletePaths = status.deleted;

		if (params.flags.has("dry-run")) {
			return {
				success: true,
				data: {
					files: deletePaths,
				},
			};
		}
		const commitMessage =
			params.args.message ?? "Deleted via Quartz Syncer CLI";
		const result = await publisher.deleteBatch(deletePaths, commitMessage);

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Delete failed",
			};
		}

		return {
			success: true,
			data: {
				...result,
				...(params.verbose ? { files: deletePaths } : {}),
			},
		};
	};
}
