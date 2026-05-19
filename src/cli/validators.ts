import type QuartzSyncer from "main";

/**
 * Pre-flight validation for CLI commands that depend on Git settings.
 * Returns an error message string if validation fails, or null if valid.
 * Catches common misconfigurations before expensive operations.
 */
export function validatePreFlight(plugin: QuartzSyncer): string | null {
	if (!plugin.settings.gitRemoteUrl) {
		return "Git remote URL is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=gitRemoteUrl value=<url>'.";
	}

	if (!plugin.settings.gitBranch) {
		return "Git branch is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=gitBranch value=<branch>'.";
	}

	return null;
}
