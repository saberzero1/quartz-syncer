import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { requireQuartzRunner } from "src/cli/handlers/guards";

const DEFAULT_PORT = 8080;

export function createQuartzServeHandler(plugin: QuartzSyncer): CliHandler {
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

		const rawPort = params.args.port;
		const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
		if (!Number.isInteger(port) || port <= 0) {
			return {
				success: false,
				error: `Invalid port: ${rawPort ?? ""}`,
			};
		}

		quartzRunner.stopServe();
		const result = quartzRunner.serve({
			cwd: plugin.settings.quartzRepoPath,
			port,
			timeout: -1,
		});

		if (!result.ok) {
			return { success: false, error: result.error };
		}

		return {
			success: true,
			data: {
				port,
				message: `Quartz dev server started on port ${port}`,
			},
		};
	};
}
