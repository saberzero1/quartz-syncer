import type QuartzSyncer from "src/main";
import type { CliResult } from "src/cli/types";

export function requireQuartzRunner(plugin: QuartzSyncer): CliResult | null {
	if (!plugin.settings.quartzRepoPath) {
		return {
			success: false,
			error: "No local Quartz repository path configured. Set it in Settings → Quartz Syncer → Quartz repo path.",
		};
	}

	if (!plugin.quartzRunner) {
		return {
			success: false,
			error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
		};
	}

	return null;
}
