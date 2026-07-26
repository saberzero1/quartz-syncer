import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createUpgradeHandler(plugin: QuartzSyncer): CliHandler {
	return async () => {
		if (
			plugin.settings.enableSystemCommands &&
			plugin.settings.quartzRepoPath &&
			plugin.quartzRunner
		) {
			const result = await plugin.quartzRunner.update({
				cwd: plugin.settings.quartzRepoPath,
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return {
				success: true,
				data: { message: "Quartz updated via local CLI." },
			};
		}

		return {
			success: true,
			data: {
				message:
					"Quartz upgrade via CLI is coming soon. QuartzUpgradeService wiring is pending.",
			},
		};
	};
}
