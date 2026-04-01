import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import {
	UPSTREAM_REPO_URL,
	UPSTREAM_BRANCH,
} from "src/quartz/QuartzUpgradeService";

const COMMAND = "quartz-syncer:upgrade";

const FLAGS: CliFlags = {
	force: {
		description: "Apply upgrade (required)",
	},
	"dry-run": {
		description: "Check for updates without applying",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createUpgradeHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Upgrade the Quartz repository from upstream",
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

				const gitSettings = plugin.getGitSettingsWithSecret();

				const connection = new RepositoryConnection({
					gitSettings,
					contentFolder: plugin.settings.contentFolder,
					vaultPath: plugin.settings.vaultPath,
				});

				const dryRun = params["dry-run"] === "true";
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const buildVerboseMessage = (
					baseMessage: string,
					shaLines: string[],
				): string => {
					if (!includeVerbose) {
						return baseMessage;
					}

					return [
						baseMessage,
						`Upstream: ${UPSTREAM_REPO_URL}#${UPSTREAM_BRANCH}`,
						...shaLines,
					].join("\n");
				};

				if (dryRun) {
					const lastUpstream = plugin.settings.lastUpstreamCommitSha;

					if (!lastUpstream) {
						const baseMessage =
							"No upstream commit recorded. Run upgrade with force to set it.";

						const message = buildVerboseMessage(baseMessage, [
							"Recorded SHA: none",
						]);

						return formatCliOutput(
							params,
							cliSuccess(COMMAND, message, {
								lastUpstreamCommitSha: null,
								alreadyMerged: false,
							}),
						);
					}

					const alreadyMerged =
						await connection.hasCommitInHistory(lastUpstream);

					const baseMessage = alreadyMerged
						? "Already up to date."
						: "Upstream updates available.";

					const message = buildVerboseMessage(baseMessage, [
						`Recorded SHA: ${lastUpstream}`,
					]);

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, {
							lastUpstreamCommitSha: lastUpstream,
							alreadyMerged,
						}),
					);
				}

				const force = params.force === "true";

				if (!force) {
					return formatCliOutput(
						params,
						cliError(COMMAND, "Upgrade requires the 'force' flag."),
					);
				}

				const result = await connection.upgradeFromUpstream(
					UPSTREAM_REPO_URL,
					UPSTREAM_BRANCH,
				);

				if (!result.alreadyMerged) {
					plugin.settings.lastUpstreamCommitSha = result.oid;
					await plugin.saveSettings();
				}

				const baseMessage = result.alreadyMerged
					? "Already up to date."
					: `Upgraded to ${result.oid}.`;

				const message = buildVerboseMessage(baseMessage, [
					`Upstream SHA: ${result.oid}`,
					`Recorded SHA: ${plugin.settings.lastUpstreamCommitSha ?? "none"}`,
				]);

				return formatCliOutput(
					params,
					cliSuccess(COMMAND, message, result),
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
