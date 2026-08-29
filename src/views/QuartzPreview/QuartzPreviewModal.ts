import { Notice, Platform } from "obsidian";
import type { App } from "obsidian";
import type { InternalPlugins } from "obsidian-typings";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";

export function launchQuartzPreview(
	app: App,
	quartzRunner: QuartzRunner,
	repoPath: string,
	port = 8080,
): void {
	if (!Platform.isDesktopApp) {
		new Notice("Quartz preview is only available on desktop.");
		return;
	}

	const internalPlugins = (
		app as unknown as { internalPlugins?: InternalPlugins }
	).internalPlugins;
	const webviewerPlugin = internalPlugins?.getPluginById("webviewer");

	if (!webviewerPlugin?.enabled || !webviewerPlugin?.instance) {
		new Notice(
			"Enable the Web Viewer core plugin in Settings → Core plugins to use preview.",
		);
		return;
	}

	const url = `http://localhost:${port}`;

	new Notice("Starting Quartz preview server…");

	const result = quartzRunner.serve({
		cwd: repoPath,
		port,
		signal: new AbortController().signal,
		onStdout: (line) => {
			// eslint-disable-next-line no-control-regex -- Control characters are used for color codes in the terminal output
			const stripped = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
			if (/listening at/i.test(stripped)) {
				webviewerPlugin.instance.openUrl(url, "tab", true);
			}
		},
		onStderr: () => {},
	});

	if (!result.ok) {
		new Notice(result.error);
	}
}
