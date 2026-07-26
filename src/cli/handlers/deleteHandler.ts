import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createDeleteHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		const result = await publisher.deleteBatch(
			status.deleted,
			"Deleted via Quartz Syncer CLI",
		);

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Delete failed",
			};
		}

		return { success: true, data: result };
	};
}
