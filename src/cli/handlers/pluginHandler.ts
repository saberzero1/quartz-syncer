import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import { validatePreFlight } from "../validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";
import { QuartzPluginUpdateChecker } from "src/quartz/QuartzPluginUpdateChecker";
import {
	getPluginName,
	getPluginSourceKey,
} from "src/quartz/QuartzPluginUtils";
import type {
	QuartzPluginEntry,
	QuartzPluginSource,
} from "src/quartz/QuartzConfigTypes";
import type { RegistryPluginEntry } from "src/quartz/QuartzPluginRegistry";
import type { PluginUpdateStatus } from "src/quartz/QuartzPluginUpdateChecker";

const COMMAND = "quartz-syncer:plugin";

const FLAGS: CliFlags = {
	action: {
		value: "<list|add|remove|updates|update|browse>",
		description: "Plugin operation (default: list)",
	},
	source: {
		value: "<github:org/repo>",
		description: "Plugin source identifier",
	},
	force: {
		description: "Required for plugin removal",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

const DEFAULT_ORDER = 50;

function createConfigService(plugin: QuartzSyncer): QuartzConfigService {
	const gitSettings = plugin.getGitSettingsWithSecret();

	const connection = new RepositoryConnection({
		gitSettings,
		contentFolder: plugin.settings.contentFolder,
		vaultPath: plugin.settings.vaultPath,
	});

	return new QuartzConfigService(connection);
}

function formatPluginList(
	plugins: QuartzPluginEntry[],
	includeVerbose: boolean,
): string {
	const lines: string[] = [];

	for (const plugin of plugins) {
		const name = getPluginName(plugin.source);
		const status = plugin.enabled ? "enabled" : "disabled";
		const order = plugin.order ?? DEFAULT_ORDER;
		lines.push(`${name} [${status}] (order: ${order})`);

		if (includeVerbose) {
			lines.push(`\tSource: ${getPluginSourceKey(plugin.source)}`);
			lines.push(`\tOptions: ${JSON.stringify(plugin.options ?? {})}`);
		}
	}

	return lines.join("\n");
}

function formatUpdateList(
	statuses: PluginUpdateStatus[],
	includeVerbose: boolean,
): string {
	const lines: string[] = [];

	for (const status of statuses) {
		const label = status.hasUpdate ? "update available" : "up to date";
		lines.push(`${status.name} [${label}]`);

		if (includeVerbose) {
			lines.push(`\tLocked: ${status.lockedCommit ?? "none"}`);
			lines.push(`\tRemote: ${status.remoteCommit ?? "unknown"}`);

			if (status.error) {
				lines.push(`\tError: ${status.error}`);
			}
		}
	}

	return lines.join("\n");
}

function formatRegistryList(
	plugins: RegistryPluginEntry[],
	includeVerbose: boolean,
): string {
	const lines: string[] = [];

	for (const plugin of plugins) {
		const badge = plugin.official ? " [official]" : "";
		lines.push(`${plugin.name} - ${plugin.description}${badge}`);

		if (includeVerbose) {
			lines.push(`\tSource: ${getPluginSourceKey(plugin.source)}`);
			lines.push(`\tTags: ${plugin.tags.join(", ") || "none"}`);
		}
	}

	return lines.join("\n");
}

export function createPluginHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Manage Quartz v5 plugins",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const verbose = params.verbose === "true";
				const includeVerbose = verbose && params.format !== "json";

				const action =
					typeof params.action === "string" ? params.action : "list";

				if (action === "browse") {
					const registry = new QuartzPluginRegistry();
					const plugins = await registry.getPlugins();

					const message = formatRegistryList(plugins, includeVerbose);

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, { plugins }),
					);
				}

				const validationError = validatePreFlight(plugin);

				if (validationError) {
					return formatCliOutput(
						params,
						cliError(COMMAND, validationError),
					);
				}

				const configService = createConfigService(plugin);
				const config = await configService.readConfig();

				if (action === "list") {
					const message = formatPluginList(
						config.plugins,
						includeVerbose,
					);

					const data = {
						plugins: config.plugins.map((pluginEntry) => ({
							name: getPluginName(pluginEntry.source),
							sourceKey: getPluginSourceKey(pluginEntry.source),
							enabled: pluginEntry.enabled,
							order: pluginEntry.order ?? DEFAULT_ORDER,
							options: pluginEntry.options ?? {},
							source: pluginEntry.source,
						})),
					};

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, data),
					);
				}

				if (action === "updates") {
					const lockFile = await configService.readLockFile();
					const gitSettings = plugin.getGitSettingsWithSecret();

					const checker = new QuartzPluginUpdateChecker(
						gitSettings.auth,
						gitSettings.corsProxyUrl || undefined,
					);

					const updates = await checker.checkUpdates(
						config.plugins,
						lockFile,
					);

					const updatable = updates.filter((u) => u.hasUpdate);
					const displayList = includeVerbose ? updates : updatable;

					const message =
						displayList.length > 0
							? formatUpdateList(displayList, includeVerbose)
							: "All plugins are up to date.";

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, {
							updates,
							updatable: updatable.length,
						}),
					);
				}

				if (action === "update") {
					const lockFile = await configService.readLockFile();
					const gitSettings = plugin.getGitSettingsWithSecret();

					const checker = new QuartzPluginUpdateChecker(
						gitSettings.auth,
						gitSettings.corsProxyUrl || undefined,
					);

					const updates = await checker.checkUpdates(
						config.plugins,
						lockFile,
					);

					const updatable = updates.filter(
						(u) => u.hasUpdate && u.remoteCommit,
					);

					if (updatable.length === 0) {
						return formatCliOutput(
							params,
							cliSuccess(COMMAND, "All plugins are up to date.", {
								updated: 0,
							}),
						);
					}

					if (params.force !== "true") {
						const names = updatable.map((u) => u.name).join(", ");

						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								`${updatable.length} plugin${updatable.length === 1 ? "" : "s"} can be updated (${names}). Use 'force' to apply.`,
							),
						);
					}

					const newLockFile = lockFile ?? {
						version: "1",
						plugins: {},
					};

					for (const update of updatable) {
						if (newLockFile.plugins[update.name]) {
							newLockFile.plugins[update.name].commit =
								update.remoteCommit!;
						}
					}

					await configService.writeLockFile(
						newLockFile,
						`Update ${updatable.length} plugin${updatable.length === 1 ? "" : "s"}`,
					);

					const updatedNames = updatable.map((u) => u.name);
					const message = `Updated ${updatable.length} plugin${updatable.length === 1 ? "" : "s"}: ${updatedNames.join(", ")}.`;

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, message, {
							updated: updatable.length,
							plugins: updatable.map((u) => ({
								name: u.name,
								from: u.lockedCommit,
								to: u.remoteCommit,
							})),
						}),
					);
				}

				const source =
					typeof params.source === "string" ? params.source : "";

				if (action === "add") {
					if (!source) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Missing required flag: source"),
						);
					}

					const pluginManager = new QuartzPluginManager();

					const entry = pluginManager.addPlugin(
						config,
						source as QuartzPluginSource,
					);
					const name = getPluginName(entry.source);

					await configService.writeConfig(
						config,
						`Add plugin: ${name}`,
					);

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, `Added plugin ${name}.`, {
							name,
							source: entry.source,
						}),
					);
				}

				if (action === "remove") {
					if (!source) {
						return formatCliOutput(
							params,
							cliError(COMMAND, "Missing required flag: source"),
						);
					}

					if (params.force !== "true") {
						return formatCliOutput(
							params,
							cliError(
								COMMAND,
								"Removing a plugin requires the 'force' flag.",
							),
						);
					}

					const pluginManager = new QuartzPluginManager();
					const sourceKey = getPluginSourceKey(source);

					const removed = pluginManager.removePlugin(
						config,
						sourceKey,
					);
					const name = getPluginName(removed.source);

					await configService.writeConfig(
						config,
						`Remove plugin: ${name}`,
					);

					return formatCliOutput(
						params,
						cliSuccess(COMMAND, `Removed plugin ${name}.`, {
							name,
							source: removed.source,
						}),
					);
				}

				return formatCliOutput(
					params,
					cliError(
						COMMAND,
						"Invalid action. Use list, add, remove, updates, update, or browse.",
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
