import QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

const COMMAND = "quartz-syncer:test";

const FLAGS: CliFlags = {
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createTestHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Test repository connection and credentials",
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
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const connection = new RepositoryConnection({
					gitSettings,
					contentFolder: plugin.settings.contentFolder,
					vaultPath: plugin.settings.vaultPath,
				});

				const canRead = await connection.testConnection();

				const canWrite = canRead
					? await RepositoryConnection.checkWriteAccess(
							gitSettings.remoteUrl,
							gitSettings.auth,
							gitSettings.corsProxyUrl,
						)
					: false;

				const data = {
					repository: connection.getRepositoryName(),
					branch: gitSettings.branch,
					readAccess: canRead,
					writeAccess: canWrite,
				};

				const baseMessage = canRead
					? `Connection OK (read: ${canRead ? "yes" : "no"}, write: ${canWrite ? "yes" : "no"}).`
					: "Connection failed.";

				const authParts = [
					`type: ${gitSettings.auth?.type ?? "unknown"}`,
				];

				if (gitSettings.auth?.username) {
					authParts.push(`username: ${gitSettings.auth.username}`);
				}

				const message =
					includeVerbose && canRead
						? [
								baseMessage,
								`Repository: ${data.repository}`,
								`Branch: ${data.branch}`,
								`Auth: ${authParts.join(", ")}`,
							].join("\n")
						: baseMessage;

				return formatCliOutput(
					params,
					canRead
						? cliSuccess(COMMAND, message, data)
						: cliError(COMMAND, message),
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
