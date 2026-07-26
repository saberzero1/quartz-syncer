import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createMarkHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => ({
		success: true,
		data: {
			message: "Mark requires configured repository",
			params,
		},
	});
}
