import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createSyncHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => ({
		success: true,
		data: {
			message: "Sync requires configured repository",
		},
	});
}
