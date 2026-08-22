import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import type { PublishFile } from "src/publishFile/PublishFile";

export function createStatusHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		if (params.verbose) {
			const enrichFile = async (file: PublishFile) => {
				const cached = await _plugin.dataStore.loadLocalFile(
					file.file.path,
				);
				const blobCount = cached ? cached[1].blobs.length : 0;

				return {
					path: file.getVaultPath(),
					publishFlag: file.shouldPublish(),
					hasMedia: blobCount > 0,
				};
			};

			return {
				success: true,
				data: {
					unpublished: {
						count: status.unpublished.length,
						files: await Promise.all(
							status.unpublished.map(enrichFile),
						),
					},
					changed: {
						count: status.changed.length,
						files: await Promise.all(
							status.changed.map(enrichFile),
						),
					},
					published: {
						count: status.published.length,
						files: await Promise.all(
							status.published.map(enrichFile),
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
