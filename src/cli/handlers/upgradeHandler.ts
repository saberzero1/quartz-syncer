import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createUpgradeHandler(_plugin: QuartzSyncer): CliHandler {
	return async () => {
		return {
			success: true,
			data: {
				message:
					"Quartz upgrade via CLI is coming soon. QuartzUpgradeService wiring is pending.",
			},
		};
	};
}
