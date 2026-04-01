import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { CliProgressController } from "../cliProgressController";
import Publisher from "src/publisher/Publisher";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

const COMMAND = "quartz-syncer:publish";

const FLAGS: CliFlags = {
	"dry-run": {
		description: "Show what would be published without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createPublishHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Publish pending notes without deletions",
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

				const filesToPublish = [
					...status.unpublishedNotes,
					...status.changedNotes,
				];

				const data = {
					publish: filesToPublish.map((f) => f.getPath()),
					summary: {
						published: filesToPublish.length,
					},
				};

				const buildVerboseMessage = (
					published: string[],
					fallback: string,
				): string => {
					if (!includeVerbose) {
						return fallback;
					}

					if (published.length === 0) {
						return fallback;
					}

					return [
						`Published ${published.length} file${published.length === 1 ? "" : "s"}:`,
						...published.map((path) => `\t${path}`),
					].join("\n");
				};

				if (dryRun) {
					const baseMessage = `Dry run: ${filesToPublish.length} to publish.`;

					const message = buildVerboseMessage(
						data.publish,
						baseMessage,
					);

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

				if (filesToPublish.length === 0) {
					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							buildVerboseMessage([], "Nothing to publish."),
							data,
							Date.now() - startTime,
						),
					);
				}

				const connection = publisher.createConnection();

				const publishOk = await publisher.publishBatch(
					filesToPublish,
					connection,
				);

				if (!publishOk) {
					throw new Error("Failed to publish files.");
				}

				const baseMessage = `Published ${filesToPublish.length} file${filesToPublish.length === 1 ? "" : "s"}.`;
				const message = buildVerboseMessage(data.publish, baseMessage);

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
