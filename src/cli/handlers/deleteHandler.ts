import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createDeleteHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => ({
		success: true,
		data: {
			message: "Delete requires configured repository",
		},
	});
}
