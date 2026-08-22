import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import type { QuartzSyncerCache } from "src/cache/DataStore";

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

		if (action === "export") {
			const data = await dataStore.exportCache();
			const entryCount = Object.keys(data).length;

			return {
				success: true,
				data: { entries: entryCount, cache: data },
			};
		}

		if (action === "import") {
			const rawData = params.args.data;
			if (!rawData) {
				return { success: false, error: "Missing data parameter" };
			}

			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(rawData) as Record<string, unknown>;
			} catch {
				return {
					success: false,
					error: "Invalid JSON in data parameter",
				};
			}

			const imported = await dataStore.importCache(
				parsed as Record<string, QuartzSyncerCache>,
			);

			return {
				success: true,
				data: { imported },
			};
		}

		if (action === "prune") {
			if (typeof dataStore.dropOutdatedCache !== "function") {
				return { success: false, error: `Unknown action: ${action}` };
			}
			await dataStore.dropOutdatedCache();

			return {
				success: true,
				data: { pruned: true },
			};
		}

		if (action === "status") {
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
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
