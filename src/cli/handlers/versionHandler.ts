import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

type VersionedApp = {
	version?: string;
};

export function createVersionHandler(plugin: QuartzSyncer): CliHandler {
	return async () => {
		const pluginVersion = plugin.manifest.version;
		const appWithVersion = plugin.app as VersionedApp;
		const obsidianVersion = appWithVersion.version ?? "unknown";

		const repo = createRepositoryAdapter(plugin);
		if (!repo) {
			return {
				success: true,
				data: {
					pluginVersion,
					obsidianVersion,
					quartzVersion: "unknown",
					quartzPackageVersion: null,
				},
			};
		}

		try {
			const quartzVersion =
				await QuartzVersionDetector.detectQuartzVersion(repo);
			const quartzPackageVersion =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);

			return {
				success: true,
				data: {
					pluginVersion,
					obsidianVersion,
					quartzVersion,
					quartzPackageVersion,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	};
}
