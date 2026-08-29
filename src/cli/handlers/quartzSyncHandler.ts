import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { requireQuartzRunner } from "src/cli/handlers/guards";

export function createQuartzSyncHandler(plugin: QuartzSyncer): CliHandler {
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

		const commit = parseBooleanArg(params.args.commit, true);
		if (commit === null) {
			return { success: false, error: "Invalid commit value" };
		}
		const push = parseBooleanArg(params.args.push, true);
		if (push === null) {
			return { success: false, error: "Invalid push value" };
		}
		const pull = parseBooleanArg(params.args.pull, true);
		if (pull === null) {
			return { success: false, error: "Invalid pull value" };
		}

		const result = await quartzRunner.sync({
			cwd: plugin.settings.quartzRepoPath,
			commit,
			push,
			pull,
			message: params.args.message,
		});

		if (!result.ok) {
			return { success: false, error: result.error };
		}

		return {
			success: true,
			data: { message: "Quartz sync completed." },
		};
	};
}

function parseBooleanArg(
	value: string | undefined,
	defaultValue: boolean,
): boolean | null {
	if (value === undefined) return defaultValue;
	const normalized = value.trim().toLowerCase();
	if (["true", "1", "yes", "on"].includes(normalized)) return true;
	if (["false", "0", "no", "off"].includes(normalized)) return false;
	return null;
}
