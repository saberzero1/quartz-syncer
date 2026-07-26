import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createPublishHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		const files = [...status.unpublished, ...status.changed];
		const result = await publisher.publishBatch(
			files,
			"Published via Quartz Syncer CLI",
		);

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Publish failed",
			};
		}

		return { success: true, data: result };
	};
}
