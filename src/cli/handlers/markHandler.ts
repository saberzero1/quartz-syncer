import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { resolvePathPattern } from "../pathResolver";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

const COMMAND = "quartz-syncer:mark";

const FLAGS: CliFlags = {
	path: {
		value: "<vault-path|glob|~fuzzy>",
		description: "File path, glob, or fuzzy query (prefix with ~)",
	},
	value: {
		value: "<true|false|toggle>",
		description: "Publish flag value (default: true)",
	},
	"dry-run": {
		description: "Show matched files without modifying",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

type PublishFlagValue = true | false | "toggle";

function parseFlagValue(raw: string | undefined): PublishFlagValue | null {
	if (!raw) return true;

	if (raw === "true") return true;

	if (raw === "false") return false;

	if (raw === "toggle") return "toggle";

	return null;
}

function getBooleanValue(value: string | number | boolean): boolean {
	return value === true || value === "true" || value === 1;
}

export function createMarkHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Set or toggle the publish flag for matching files",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const pathPattern =
					typeof params.path === "string" ? params.path : "";

				if (!pathPattern) {
					return formatCliOutput(
						params,
						cliError(COMMAND, "Missing required flag: path"),
					);
				}

				const parsedValue = parseFlagValue(
					typeof params.value === "string" ? params.value : undefined,
				);

				if (parsedValue === null) {
					return formatCliOutput(
						params,
						cliError(
							COMMAND,
							"Invalid value. Use true, false, or toggle.",
						),
					);
				}

				const dryRun = params["dry-run"] === "true";
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";
				const resolved = resolvePathPattern(plugin.app, pathPattern);

				const vaultPath = plugin.settings.vaultPath;
				const vaultIsRoot = vaultPath === "/";

				const files = resolved.files.filter(
					(f) => vaultIsRoot || f.path.startsWith(vaultPath),
				);

				if (files.length === 0) {
					return formatCliOutput(
						params,
						cliError(
							COMMAND,
							"No publishable files matched the provided path.",
						),
					);
				}

				const updated: string[] = [];
				const failed: Array<{ path: string; error: string }> = [];

				const appliedValues: Array<{ path: string; value: boolean }> =
					[];

				for (const file of files) {
					try {
						const engine = new ObsidianFrontMatterEngine(
							plugin.app.vault,
							plugin.app.metadataCache,
							file,
							plugin.app.fileManager,
						);

						let nextValue: boolean;

						if (parsedValue === "toggle") {
							const current = engine.get(
								plugin.settings.publishFrontmatterKey,
							);
							nextValue = !getBooleanValue(current);
						} else {
							nextValue = parsedValue;
						}

						if (!dryRun) {
							await engine
								.set(
									plugin.settings.publishFrontmatterKey,
									nextValue,
								)
								.apply();
						}

						updated.push(file.path);

						appliedValues.push({
							path: file.path,
							value: nextValue,
						});
					} catch (error) {
						failed.push({
							path: file.path,
							error:
								error instanceof Error
									? error.message
									: String(error),
						});
					}
				}

				const data = {
					mode: resolved.mode,
					pattern: resolved.pattern,
					dryRun,
					matched: files.map((f) => f.path),
					updated,
					failed,
					appliedValues,
				};

				const messageParts = [
					dryRun
						? `Dry run: ${updated.length} file${updated.length === 1 ? "" : "s"} matched`
						: `Updated ${updated.length} file${updated.length === 1 ? "" : "s"}`,
					`Mode: ${resolved.mode}`,
				];

				if (failed.length > 0) {
					messageParts.push(
						`Failed: ${failed.length} file${failed.length === 1 ? "" : "s"}`,
					);
				}

				const baseMessage = messageParts.join(". ") + ".";

				const verboseHeader = [
					`Vault root: ${vaultIsRoot ? "/" : vaultPath}`,
					`All notes publishable: ${plugin.settings.allNotesPublishableByDefault ? "yes" : "no"}`,
				];

				const message = includeVerbose
					? [
							baseMessage,
							...verboseHeader,
							...(data.appliedValues.length > 0
								? data.appliedValues.map(
										(entry) =>
											`\t${entry.path} → ${entry.value}`,
									)
								: []),
						].join("\n")
					: baseMessage;

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
