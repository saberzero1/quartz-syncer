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

	const internalPlugins = (app as any).internalPlugins as
		| InternalPlugins
		| undefined;
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
			if (/server running/i.test(line)) {
				webviewerPlugin.instance.openUrl(url, "tab", true);
			}
		},
		onStderr: () => {},
	});

	if (!result.ok) {
		new Notice(result.error);
	}
}
