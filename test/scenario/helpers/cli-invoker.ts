import { browser } from "@wdio/globals";
import type { CliResult } from "src/cli/types";

export async function invokeCliHandler(
	command: string,
	args: Record<string, string> = {},
	flags: string[] = [],
): Promise<CliResult> {
	try {
		return await browser.executeObsidian(
			async ({ app }, { command, args, flags }) => {
				type AppWithPlugins = {
					plugins: {
						getPlugin: (id: string) => unknown;
					};
				};
				const pluginHost = app as unknown as AppWithPlugins;
				const plugin = pluginHost.plugins.getPlugin(
					"quartz-syncer",
				) as any;
				const handler = plugin?.cliHandlers?.[command];
				if (!handler) {
					return {
						success: false,
						error: `CLI handler not found: ${command}`,
					};
				}
				try {
					return await handler({
						args,
						flags: new Set(flags),
						verbose: flags.includes("verbose"),
					});
				} catch (handlerError: unknown) {
					const message =
						handlerError instanceof Error
							? handlerError.message
							: String(handlerError);
					return { success: false, error: message };
				}
			},
			{ command, args, flags },
		);
	} catch (wdioError: unknown) {
		const message =
			wdioError instanceof Error ? wdioError.message : String(wdioError);
		return { success: false, error: message };
	}
}
