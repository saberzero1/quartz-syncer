import type QuartzSyncer from "main";
import { apiVersion } from "obsidian";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

const COMMAND = "quartz-syncer:version";

const FLAGS: CliFlags = {
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

const QUARTZ_CONFIG_DETAILS: Record<string, string> = {
	"v5-yaml": "quartz.config.yaml",
	"v5-json": "quartz.plugins.json",
	v4: "quartz.config.ts",
	unknown: "unknown",
};

export function createVersionHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Show plugin, Obsidian, and Quartz version information",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const pluginVersion = plugin.appVersion;
				const obsidianVersion = apiVersion ?? "unknown";

				let quartzFormat: string = "unknown";
				let quartzVersion: string | null = null;
				let connection: RepositoryConnection | null = null;

				const validationError = validatePreFlight(plugin);

				if (!validationError) {
					const gitSettings = plugin.getGitSettingsWithSecret();

					connection = new RepositoryConnection({
						gitSettings,
						contentFolder: plugin.settings.contentFolder,
						vaultPath: plugin.settings.vaultPath,
					});

					quartzFormat =
						await QuartzVersionDetector.detectQuartzVersion(
							connection,
						);

					quartzVersion =
						await QuartzVersionDetector.getQuartzPackageVersion(
							connection,
						);
				}

				const displayQuartzVersion = quartzVersion ?? "unknown";
				const displayQuartzFormat = quartzFormat ?? "unknown";

				const quartzConfigDetails =
					QUARTZ_CONFIG_DETAILS[displayQuartzFormat] ?? "unknown";

				const baseLines = [
					`Quartz Syncer: ${pluginVersion}`,
					`Obsidian: ${obsidianVersion}`,
					`Quartz: ${displayQuartzVersion} (${displayQuartzFormat})`,
				];

				const verboseLines = connection
					? [
							`Repository: ${connection.getRepositoryName()}`,
							`Branch: ${plugin.settings.git.branch}`,
							`Quartz config: ${quartzConfigDetails}`,
						]
					: [`Git: not configured`];

				const message = includeVerbose
					? [...baseLines, ...verboseLines].join("\n")
					: baseLines.join("\n");

				const data = {
					pluginVersion,
					obsidianVersion,
					quartzVersion,
					quartzFormat: displayQuartzFormat,
				};

				return formatCliOutput(
					params,
					cliSuccess(COMMAND, message, data),
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
