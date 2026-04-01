import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliError, cliSuccess } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type { QuartzSiteConfiguration } from "src/quartz/QuartzConfigTypes";

const COMMAND = "quartz-syncer:quartz-config";

const FLAGS: CliFlags = {
	action: {
		value: "<list|get|set>",
		description: "Config operation (default: list)",
	},
	key: {
		value: "<config-path>",
		description:
			"Dot-notation config key (e.g., pageTitle, theme.typography.header)",
	},
	value: {
		value: "<value>",
		description: "New value for action=set",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

const WRITABLE_KEYS: Record<string, "string" | "boolean"> = {
	pageTitle: "string",
	pageTitleSuffix: "string",
	enableSPA: "boolean",
	enablePopovers: "boolean",
	locale: "string",
	baseUrl: "string",
	"theme.fontOrigin": "string",
	"theme.cdnCaching": "boolean",
	"theme.typography.header": "string",
	"theme.typography.body": "string",
	"theme.typography.code": "string",
	"theme.colors.lightMode.light": "string",
	"theme.colors.lightMode.lightgray": "string",
	"theme.colors.lightMode.gray": "string",
	"theme.colors.lightMode.darkgray": "string",
	"theme.colors.lightMode.dark": "string",
	"theme.colors.lightMode.secondary": "string",
	"theme.colors.lightMode.tertiary": "string",
	"theme.colors.lightMode.highlight": "string",
	"theme.colors.lightMode.textHighlight": "string",
	"theme.colors.darkMode.light": "string",
	"theme.colors.darkMode.lightgray": "string",
	"theme.colors.darkMode.gray": "string",
	"theme.colors.darkMode.darkgray": "string",
	"theme.colors.darkMode.dark": "string",
	"theme.colors.darkMode.secondary": "string",
	"theme.colors.darkMode.tertiary": "string",
	"theme.colors.darkMode.highlight": "string",
	"theme.colors.darkMode.textHighlight": "string",
};

const FONT_ORIGINS = new Set(["googleFonts", "local"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function flattenConfig(
	config: unknown,
	prefix = "",
	result: Record<string, string> = {},
): Record<string, string> {
	if (!isRecord(config)) {
		if (prefix) {
			result[prefix] = JSON.stringify(config);
		}

		return result;
	}

	for (const [key, value] of Object.entries(config)) {
		const nextPrefix = prefix ? `${prefix}.${key}` : key;

		if (isRecord(value)) {
			flattenConfig(value, nextPrefix, result);
		} else {
			result[nextPrefix] = JSON.stringify(value);
		}
	}

	return result;
}

function getConfigValueByPath(
	config: QuartzSiteConfiguration,
	path: string,
): unknown {
	const segments = path.split(".");
	let current: unknown = config;

	for (const segment of segments) {
		if (!isRecord(current)) {
			return undefined;
		}

		current = current[segment];
	}

	return current;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function setConfigValueByPath(
	config: QuartzSiteConfiguration,
	path: string,
	value: string | boolean,
): boolean {
	const segments = path.split(".");

	if (segments.some((s) => FORBIDDEN_KEYS.has(s))) {
		return false;
	}

	let current: unknown = config;

	for (let i = 0; i < segments.length - 1; i++) {
		const segment = segments[i];

		if (!isRecord(current) || !Object.hasOwn(current, segment)) {
			return false;
		}

		current = current[segment];
	}

	if (!isRecord(current)) {
		return false;
	}

	const lastSegment = segments[segments.length - 1];

	if (!Object.hasOwn(current, lastSegment)) {
		return false;
	}

	current[lastSegment] = value;

	return true;
}

function parseConfigValue(
	expectedType: "string" | "boolean",
	rawValue: string,
): string | boolean | null {
	if (expectedType === "string") {
		return rawValue;
	}

	if (rawValue === "true") return true;

	if (rawValue === "false") return false;

	return null;
}

export function createQuartzConfigHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Read or update Quartz v5 site configuration",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const validationError = validatePreFlight(plugin);

				if (validationError) {
					return formatCliOutput(
						params,
						cliError(COMMAND, validationError),
					);
				}

				const action =
					typeof params.action === "string" ? params.action : "list";

				const gitSettings = plugin.getGitSettingsWithSecret();

				const connection = new RepositoryConnection({
					gitSettings,
					contentFolder: plugin.settings.contentFolder,
					vaultPath: plugin.settings.vaultPath,
				});
				const configService = new QuartzConfigService(connection);

				if (action === "list") {
					const config = await configService.readConfig();
					const flattened = flattenConfig(config.configuration);

					const message = Object.entries(flattened)
						.map(([key, value]) => `${key}=${value}`)
						.join("\n");

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, config.configuration),
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
					const config = await configService.readConfig();

					const value = getConfigValueByPath(
						config.configuration,
						key,
					);

					if (value === undefined) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Unknown config key."),
						);
					}

					const data = { key, value };
					const message = `${key}=${JSON.stringify(value)}`;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				if (action === "set") {
					const expectedType = WRITABLE_KEYS[key];

					if (!expectedType) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"Config key is not writable via CLI.",
							),
						);
					}

					if (typeof params.value !== "string") {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Missing required flag: value"),
						);
					}

					const parsed = parseConfigValue(expectedType, params.value);

					if (parsed === null) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								`Invalid value for ${key}. Expected ${expectedType}.`,
							),
						);
					}

					if (
						key === "theme.fontOrigin" &&
						typeof parsed === "string" &&
						!FONT_ORIGINS.has(parsed)
					) {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"Invalid value for theme.fontOrigin. Expected googleFonts or local.",
							),
						);
					}

					const config = await configService.readConfig();

					const setOk = setConfigValueByPath(
						config.configuration,
						key,
						parsed,
					);

					if (!setOk) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Failed to set value."),
						);
					}

					await configService.writeConfig(
						config,
						`Update Quartz config: ${key}`,
					);

					const data = { key, value: parsed };
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
