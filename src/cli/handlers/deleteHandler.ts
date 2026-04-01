import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { CliProgressController } from "../cliProgressController";
import Publisher from "src/publisher/Publisher";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

const COMMAND = "quartz-syncer:delete";

const FLAGS: CliFlags = {
	force: {
		description: "Apply deletions (required)",
	},
	"dry-run": {
		description: "Show what would be deleted without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createDeleteHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Delete removed notes from the remote repository",
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

				const startTime = Date.now();
				const dryRun = params["dry-run"] === "true";
				const force = params.force === "true";
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const siteManager = new QuartzSyncerSiteManager(
					plugin.app.metadataCache,
					plugin.settings,
					plugin.getGitSettingsWithSecret(),
				);

				const publisher = new Publisher(
					plugin.app,
					plugin,
					plugin.app.vault,
					plugin.app.metadataCache,
					plugin.settings,
					plugin.datastore,
				);

				const statusManager = new PublishStatusManager(
					siteManager,
					publisher,
				);
				const controller = new CliProgressController();
				const status = await statusManager.getPublishStatus(controller);

				const deletions = [
					...status.deletedNotePaths.map((p) => p.path),
					...status.deletedBlobPaths.map((p) => p.path),
				];

				const data = {
					delete: deletions,
					summary: {
						deleted: deletions.length,
					},
				};

				const buildVerboseMessage = (
					deleted: string[],
					fallback: string,
				): string => {
					if (!includeVerbose || deleted.length === 0) {
						return fallback;
					}

					return [
						`Deleted ${deleted.length} file${deleted.length === 1 ? "" : "s"}:`,
						...deleted.map((path) => `\t${path}`),
					].join("\n");
				};

				if (dryRun) {
					const baseMessage = `Dry run: ${deletions.length} to delete.`;
					const message = buildVerboseMessage(deletions, baseMessage);

					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							message,
							data,
							Date.now() - startTime,
						),
					);
				}

				if (deletions.length === 0) {
					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							buildVerboseMessage([], "Nothing to delete."),
							data,
							Date.now() - startTime,
						),
					);
				}

				if (!force) {
					return formatCliOutput(
						params,
						cliError(
							COMMAND,
							"Deletion requires the 'force' flag.",
						),
					);
				}

				const connection = publisher.createConnection();

				const deleteOk = await publisher.deleteBatch(
					deletions,
					connection,
				);

				if (!deleteOk) {
					throw new Error("Failed to delete files.");
				}

				const baseMessage = `Deleted ${deletions.length} file${deletions.length === 1 ? "" : "s"}.`;
				const message = buildVerboseMessage(deletions, baseMessage);

				return formatCliOutput(
					params,
					cliSuccess(COMMAND, message, data, Date.now() - startTime),
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
