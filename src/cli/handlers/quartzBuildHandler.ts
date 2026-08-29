import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { requireQuartzRunner } from "src/cli/handlers/guards";

export function createQuartzBuildHandler(plugin: QuartzSyncer): CliHandler {
	return async () => {
		const runnerCheck = requireQuartzRunner(plugin);
		if (runnerCheck) {
			return runnerCheck;
		}
		const quartzRunner = plugin.quartzRunner;
		if (!quartzRunner) {
			return {
				success: false,
				error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
			};
		}

		const result = await quartzRunner.build({
			cwd: plugin.settings.quartzRepoPath,
			timeout: -1,
		});

		if (!result.ok) {
			return { success: false, error: result.error };
		}

		return {
			success: true,
			data: { message: "Quartz build completed." },
		};
	};
}
