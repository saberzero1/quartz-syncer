import type QuartzSyncer from "main";

/**
 * Pre-flight validation for CLI commands that depend on Git settings.
 * Returns an error message string if validation fails, or null if valid.
 * Catches common misconfigurations before expensive operations.
 */
export function validatePreFlight(plugin: QuartzSyncer): string | null {
	if (!plugin.settings.git.remoteUrl) {
		return "Git remote URL is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=git.remoteUrl value=<url>'.";
	}

	if (!plugin.settings.git.branch) {
		return "Git branch is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=git.branch value=<branch>'.";
	}

	return null;
}
