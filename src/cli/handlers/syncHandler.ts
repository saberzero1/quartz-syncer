import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { CliProgressController } from "../cliProgressController";
import Publisher from "src/publisher/Publisher";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

const COMMAND = "quartz-syncer:sync";

const FLAGS: CliFlags = {
	force: {
		description: "Apply deletions (required to delete remote files)",
	},
	"dry-run": {
		description: "Show what would be published/deleted without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createSyncHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Publish pending notes and optionally delete removed notes",
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

				const filesToPublish = [
					...status.unpublishedNotes,
					...status.changedNotes,
				];

				const notePaths = new Set([
					...status.unpublishedNotes.map((f) => f.getPath()),
					...status.changedNotes.map((f) => f.getPath()),
					...status.publishedNotes.map((f) => f.getPath()),
					...status.deletedNotePaths.map((p) => p.path),
				]);

				const filteredDeletedBlobs = status.deletedBlobPaths.filter(
					(p) => !notePaths.has(p.path),
				);

				const deletions = [
					...status.deletedNotePaths.map((p) => p.path),
					...filteredDeletedBlobs.map((p) => p.path),
				];

				const data = {
					publish: filesToPublish.map((f) => f.getPath()),
					delete: deletions,
					skippedDeletes: [] as string[],
					summary: {
						published: filesToPublish.length,
						deleted: 0,
						skippedDeletes: 0,
					},
				};

				const buildVerboseMessage = (
					published: string[],
					deleted: string[],
					skipped: string[],
					fallback: string,
				): string => {
					if (!includeVerbose) {
						return fallback;
					}
					const lines: string[] = [];

					if (published.length > 0) {
						lines.push(
							`Published ${published.length} file${published.length === 1 ? "" : "s"}:`,
						);
						lines.push(...published.map((path) => `\t${path}`));
					}

					if (deleted.length > 0) {
						lines.push(
							`Deleted ${deleted.length} file${deleted.length === 1 ? "" : "s"}:`,
						);
						lines.push(...deleted.map((path) => `\t${path}`));
					}

					if (skipped.length > 0) {
						lines.push(
							`Skipped ${skipped.length} deletion${skipped.length === 1 ? "" : "s"}:`,
						);
						lines.push(...skipped.map((path) => `\t${path}`));
					}

					return lines.length > 0 ? lines.join("\n") : fallback;
				};

				if (dryRun) {
					const baseMessage = `Dry run: ${data.summary.published} to publish, ${deletions.length} to delete.`;

					const message = buildVerboseMessage(
						data.publish,
						data.delete,
						[],
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

				if (filesToPublish.length === 0 && deletions.length === 0) {
					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							buildVerboseMessage([], [], [], "Nothing to sync."),
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

				let deletedCount = 0;
				let skippedDeletes: string[] = [];

				if (deletions.length > 0) {
					if (force) {
						const deleteOk = await publisher.deleteBatch(
							deletions,
							connection,
						);

						if (!deleteOk) {
							throw new Error("Failed to delete files.");
						}
						deletedCount = deletions.length;
					} else {
						skippedDeletes = deletions;
					}
				}

				data.skippedDeletes = skippedDeletes;
				data.summary.deleted = deletedCount;
				data.summary.skippedDeletes = skippedDeletes.length;

				const messageParts = [
					`Published ${filesToPublish.length} file${filesToPublish.length === 1 ? "" : "s"}`,
					`Deleted ${deletedCount} file${deletedCount === 1 ? "" : "s"}`,
				];

				if (skippedDeletes.length > 0) {
					messageParts.push(
						`Skipped ${skippedDeletes.length} deletion${skippedDeletes.length === 1 ? "" : "s"} (use force)`,
					);
				}

				const baseMessage = messageParts.join(". ") + ".";

				const actuallyDeleted = force ? deletions : [];

				const message = buildVerboseMessage(
					data.publish,
					actuallyDeleted,
					skippedDeletes,
					baseMessage,
				);

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
