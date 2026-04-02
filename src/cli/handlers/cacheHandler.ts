import type QuartzSyncer from "main";
import { normalizePath } from "obsidian";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";

const COMMAND = "quartz-syncer:cache";

const FLAGS: CliFlags = {
	action: {
		value: "<status|clear|clear-all>",
		description: "Cache operation to perform",
	},
	path: {
		value: "<vault-path>",
		description: "File path (required for action=clear)",
	},
	force: {
		description: "Skip confirmation for clear-all",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createCacheHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Manage the Quartz Syncer cache",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				if (!plugin.settings.useCache || !plugin.datastore) {
					return formatCliOutput(
						params,
						cliError(COMMAND, "Cache is disabled."),
					);
				}

				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const action =
					typeof params.action === "string" ? params.action : "";

				if (!action) {
					return formatCliOutput(
						params,
						cliError(COMMAND, "Missing required flag: action"),
					);
				}

				if (action === "status") {
					const files = await plugin.datastore.allFiles();

					const lastUpdated =
						await plugin.datastore.getLastUpdateTimestamp();

					const data = {
						count: files.length,
						files,
						lastUpdated,
					};
					const baseMessage = `Cache contains ${files.length} file${files.length === 1 ? "" : "s"}.`;

					const message =
						includeVerbose && files.length > 0
							? [
									baseMessage,
									...files.map((path) => `\t${path}`),
								].join("\n")
							: baseMessage;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				if (action === "clear") {
					const rawPath =
						typeof params.path === "string" ? params.path : "";

					if (!rawPath) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Missing required flag: path"),
						);
					}

					const path = normalizePath(rawPath);

					await plugin.datastore.persister.removeItem(
						plugin.datastore.fileKey(path),
					);

					await plugin.datastore.setLastUpdateTimestamp(
						Date.now(),
						plugin,
					);

					const message = `Cache cleared for ${path}.`;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, { path }),
					);
				}

				if (action === "clear-all") {
					const force = params.force === "true";

					if (!force) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"Clearing all cache requires the 'force' flag.",
							),
						);
					}

					await plugin.datastore.recreate();

					await plugin.datastore.setLastUpdateTimestamp(
						Date.now(),
						plugin,
					);

					const message = "Cache cleared for all files.";

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, { cleared: true }),
					);
				}

				return formatCliOutput(
					params,
					cliError(
						COMMAND,
						"Invalid action. Use status, clear, or clear-all.",
					),
				);
			} catch (error) {
				return formatCliOutput(
					params,
					cliError(
						COMMAND,
						error instanceof Error ? error.message : String(error),
					),
				);
			}
		},
	);
}
