import type QuartzSyncer from "main";
import { normalizePath } from "obsidian";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import QuartzSyncerSettings from "src/models/settings";
import { flattenObject, getValueByPath, setValueByPath } from "../configUtils";

const COMMAND = "quartz-syncer:config";

const FLAGS: CliFlags = {
	action: {
		value: "<get|set|list>",
		description: "Config operation",
	},
	key: {
		value: "<setting-path>",
		description: "Dot-notation setting key",
	},
	value: {
		value: "<value>",
		description: "Value for action=set",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

const WRITABLE_KEYS: Record<string, "string" | "boolean"> = {
	"git.remoteUrl": "string",
	"git.branch": "string",
	"git.corsProxyUrl": "string",
	"git.auth.type": "string",
	"git.auth.username": "string",
	"git.providerHint": "string",
	contentFolder: "string",
	vaultPath: "string",
	publishFrontmatterKey: "string",
	allNotesPublishableByDefault: "boolean",
	useCache: "boolean",
	syncCache: "boolean",
	useDataview: "boolean",
	useDatacore: "boolean",
	useExcalidraw: "boolean",
	useFantasyStatblocks: "boolean",
	useBases: "boolean",
	useCanvas: "boolean",
	useThemes: "boolean",
	frontmatterFormat: "string",
	diffViewStyle: "string",
};

function redactSettings(settings: QuartzSyncerSettings): QuartzSyncerSettings {
	return {
		...settings,
		git: {
			...settings.git,
			auth: {
				...settings.git.auth,
				secret: settings.git.auth.secret ? "***" : undefined,
			},
		},
	};
}

function parseValue(
	expectedType: "string" | "boolean",
	raw: string,
): string | boolean | null {
	if (expectedType === "string") {
		return raw;
	}

	if (raw === "true") return true;

	if (raw === "false") return false;

	return null;
}

export function createConfigHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Read or update Quartz Syncer settings",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const action =
					typeof params.action === "string" ? params.action : "list";

				if (action === "list") {
					const data = redactSettings(plugin.settings);

					const message = Object.entries(flattenObject(data))
						.map(([key, value]) => `${key}=${value}`)
						.join("\n");

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				const key = typeof params.key === "string" ? params.key : "";

				if (!key) {
					return formatCliOutput(
						params,
						cliError(COMMAND, "Missing required flag: key"),
					);
				}

				if (action === "get") {
					if (key === "git.auth.secret") {
						const data = { key, value: "***" };
						const baseMessage = `${key}="***"`;

						const message = includeVerbose
							? `${baseMessage} (type: string)`
							: baseMessage;

						return formatCliOutput(
							params,
							cliSuccess(COMMAND, message, data),
						);
					}

					const value = getValueByPath(plugin.settings, key);

					if (value === undefined) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Unknown setting key."),
						);
					}

					const data = { key, value };
					const baseMessage = `${key}=${JSON.stringify(value)}`;

					const message = includeVerbose
						? `${baseMessage} (type: ${typeof value})`
						: baseMessage;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				if (action === "set") {
					if (key === "git.auth.secret") {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"git.auth.secret cannot be set via CLI.",
							),
						);
					}

					const expectedType = WRITABLE_KEYS[key];

					if (!expectedType) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"Setting is not writable via CLI.",
							),
						);
					}

					if (typeof params.value !== "string") {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Missing required flag: value"),
						);
					}
					const rawValue = params.value;

					const parsed = parseValue(expectedType, rawValue);

					if (parsed === null) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								`Invalid value for ${key}. Expected ${expectedType}.`,
							),
						);
					}

					let normalizedValue = parsed;

					if (typeof parsed === "string") {
						if (key === "vaultPath") {
							const trimmed = parsed.trim();

							if (trimmed === "/" || trimmed === "") {
								normalizedValue = "/";
							} else {
								const np = normalizePath(trimmed);

								normalizedValue = np.endsWith("/")
									? np
									: np + "/";
							}
						} else if (key === "contentFolder") {
							normalizedValue = normalizePath(parsed.trim());
						}
					}

					const setOk = setValueByPath(
						plugin.settings,
						key,
						normalizedValue,
					);

					if (!setOk) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Failed to set value."),
						);
					}

					await plugin.saveSettings();

					const data = { key, value: normalizedValue };
					const message = `Updated ${key}.`;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				return formatCliOutput(
					params,
					cliError(COMMAND, "Invalid action. Use get, set, or list."),
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
