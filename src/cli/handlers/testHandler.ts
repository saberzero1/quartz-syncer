import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createTestHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => ({
		success: true,
		data: {
			message: "Test requires configured repository",
		},
	});
}
