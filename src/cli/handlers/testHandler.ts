import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { createGitBackend } from "src/git/GitBackendFactory";

export function createTestHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		if (!_plugin.settings.gitRemoteUrl) {
			return { success: false, error: "Repository not configured" };
		}

		const gitSettings = _plugin.getGitSettingsWithSecret();
		const backend = createGitBackend(
			{
				remoteUrl: gitSettings.remoteUrl,
				branch: gitSettings.branch,
				corsProxyUrl: gitSettings.corsProxyUrl,
				auth: gitSettings.auth,
			},
			_plugin.app,
		);

		const result = await backend.testConnection();
		if (!result.ok) {
			return {
				success: false,
				error: result.error ?? "Connection failed",
			};
		}

		return {
			success: true,
			data: {
				...result,
				...(params.verbose
					? {
							url: gitSettings.remoteUrl,
							branch: gitSettings.branch,
							authType: gitSettings.auth.type,
							provider: gitSettings.providerHint ?? "unknown",
						}
					: {}),
			},
		};
	};
}
