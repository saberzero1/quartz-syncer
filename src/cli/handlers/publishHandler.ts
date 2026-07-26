import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createPublishHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => ({
		success: true,
		data: {
			message: "Publish requires configured repository",
		},
	});
}
