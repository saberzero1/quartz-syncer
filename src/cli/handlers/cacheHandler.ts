import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

const DEFAULT_ACTION = "status";

export function createCacheHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;
		const dataStore = plugin.dataStore;

		if (!dataStore) {
			return { success: false, error: "Cache is not available" };
		}

		if (action === "clear") {
			await dataStore.dropAllFiles();
			return { success: true, data: { cleared: true } };
		}

		if (action === "clear-file") {
			const path = params.args.path;
			if (!path) {
				return { success: false, error: "Missing path parameter" };
			}
			await dataStore.dropFile(path);
			return { success: true, data: { cleared: path } };
		}

		if (action !== "status") {
			return { success: false, error: `Unknown action: ${action}` };
		}

		const entryCount = (await dataStore.allFiles()).length;
		let sizeEstimateBytes = 0;
		const encoder = new TextEncoder();

		await dataStore.persister.iterate((value, key) => {
			const payload = JSON.stringify({ key, value });
			sizeEstimateBytes += encoder.encode(payload).length;
		});

		return {
			success: true,
			data: {
				entries: entryCount,
				sizeEstimateBytes,
			},
		};
	};
}
