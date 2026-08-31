import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { requireGit, requireQuartzRunner } from "src/cli/handlers/guards";

export function createUpgradeHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
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

		const gitCheck = await requireGit(plugin);
		if (gitCheck) {
			return gitCheck;
		}

		const isDryRun = params.flags.has("dry-run");

		if (isDryRun) {
			return {
				success: true,
				data: {
					message:
						"Dry run: would run 'npx quartz update' in local Quartz repository.",
					quartzRepoPath: plugin.settings.quartzRepoPath,
				},
			};
		}

		const result = await quartzRunner.update({
			cwd: plugin.settings.quartzRepoPath,
		});

		if (!result.ok) {
			return { success: false, error: result.error };
		}

		return {
			success: true,
			data: { message: "Quartz updated successfully." },
		};
	};
}
