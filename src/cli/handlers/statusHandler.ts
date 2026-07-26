import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createStatusHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		return {
			success: true,
			data: {
				unpublished: status.unpublished.length,
				changed: status.changed.length,
				published: status.published.length,
				deleted: status.deleted.length,
			},
		};
	};
}
