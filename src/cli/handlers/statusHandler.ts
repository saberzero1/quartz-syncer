import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createStatusHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => ({
		success: true,
		data: {
			message: "Status check requires configured repository",
		},
	});
}
