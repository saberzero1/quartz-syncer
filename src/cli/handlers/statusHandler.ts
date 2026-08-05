import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createStatusHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		if (params.verbose) {
			return {
				success: true,
				data: {
					unpublished: {
						count: status.unpublished.length,
						files: status.unpublished.map((file) =>
							file.getVaultPath(),
						),
					},
					changed: {
						count: status.changed.length,
						files: status.changed.map((file) =>
							file.getVaultPath(),
						),
					},
					published: {
						count: status.published.length,
						files: status.published.map((file) =>
							file.getVaultPath(),
						),
					},
					deleted: {
						count: status.deleted.length,
						files: status.deleted,
					},
				},
			};
		}
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
