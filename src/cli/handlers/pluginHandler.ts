import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import {
	createRepositoryAdapter,
	parseCliValue,
} from "src/cli/handlers/cliUtils";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import type { QuartzPluginSource } from "src/quartz/QuartzConfigTypes";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";
import { requireQuartzRunner } from "src/cli/handlers/guards";

const DEFAULT_ACTION = "list";

function parsePluginSource(rawSource: string): QuartzPluginSource {
	const trimmed = rawSource.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		const parsed = parseCliValue(trimmed);
		if (typeof parsed === "object" && parsed !== null) {
			return parsed as QuartzPluginSource;
		}
	}

	return rawSource;
}

export function createPluginHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;
		const repo = createRepositoryAdapter(plugin);
		const manager = new QuartzPluginManager();

		if (action === "list") {
			if (!repo) {
				return { success: false, error: "Repository not configured" };
			}
			const configService = new QuartzConfigService(repo);
			const config = await configService.readConfig();
			return { success: true, data: config.plugins };
		}

		if (action === "add") {
			if (!repo) {
				return { success: false, error: "Repository not configured" };
			}
			const sourceArg = params.args.source;
			if (!sourceArg) {
				return { success: false, error: "Missing source parameter" };
			}
			const configService = new QuartzConfigService(repo);
			const config = await configService.readConfig();
			const source = parsePluginSource(sourceArg);

			if (params.flags.has("dry-run")) {
				const cloned = structuredClone(config);
				const added = manager.addPlugin(cloned, source);
				return { success: true, data: { dryRun: true, ...added } };
			}

			const added = manager.addPlugin(config, source);
			await configService.writeConfig(config);
			return { success: true, data: added };
		}

		if (action === "remove") {
			if (!repo) {
				return { success: false, error: "Repository not configured" };
			}
			const name = params.args.name;
			if (!name) {
				return { success: false, error: "Missing name parameter" };
			}
			const configService = new QuartzConfigService(repo);
			const config = await configService.readConfig();

			if (params.flags.has("dry-run")) {
				const cloned = structuredClone(config);
				const removed = manager.removePlugin(cloned, name);
				return { success: true, data: { dryRun: true, ...removed } };
			}

			const removed = manager.removePlugin(config, name);
			await configService.writeConfig(config);
			return { success: true, data: removed };
		}

		if (action === "search") {
			const registry = new QuartzPluginRegistry();
			const allPlugins = await registry.getPlugins();
			const query = params.args.query?.toLowerCase();

			if (!query) {
				return {
					success: true,
					data: {
						count: allPlugins.length,
						plugins: allPlugins,
					},
				};
			}

			const filtered = allPlugins.filter((entry) => {
				const nameMatch =
					entry.displayName?.toLowerCase().includes(query) ?? false;
				const descMatch =
					entry.description?.toLowerCase().includes(query) ?? false;
				const keywordMatch = (entry.keywords ?? []).some((kw) =>
					kw.toLowerCase().includes(query),
				);
				const categoryMatch = Array.isArray(entry.category)
					? entry.category.some((c) =>
							c.toLowerCase().includes(query),
						)
					: (entry.category?.toLowerCase().includes(query) ?? false);

				return nameMatch || descMatch || keywordMatch || categoryMatch;
			});

			return {
				success: true,
				data: {
					query,
					count: filtered.length,
					plugins: filtered,
				},
			};
		}

		if (action === "install") {
			const runnerCheck = requireQuartzRunner(plugin);
			if (runnerCheck) {
				return runnerCheck;
			}
			const quartzRunner = plugin.quartzRunner;
			if (!quartzRunner) {
				return {
					success: false,
					error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
				};
			}
			const result = await quartzRunner.pluginInstall({
				cwd: plugin.settings.quartzRepoPath,
				fromConfig: params.flags.has("from-config"),
				latest: params.flags.has("latest"),
				clean: params.flags.has("clean"),
				dryRun: params.flags.has("dry-run"),
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return { success: true, data: result.data };
		}

		if (action === "enable") {
			const runnerCheck = requireQuartzRunner(plugin);
			if (runnerCheck) {
				return runnerCheck;
			}
			const quartzRunner = plugin.quartzRunner;
			if (!quartzRunner) {
				return {
					success: false,
					error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
				};
			}
			const names = params.args.name;
			if (!names) {
				return { success: false, error: "Missing name parameter" };
			}
			const parsedNames = names
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean);
			const result = await quartzRunner.pluginEnable(parsedNames, {
				cwd: plugin.settings.quartzRepoPath,
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return { success: true, data: result.data };
		}

		if (action === "disable") {
			const runnerCheck = requireQuartzRunner(plugin);
			if (runnerCheck) {
				return runnerCheck;
			}
			const quartzRunner = plugin.quartzRunner;
			if (!quartzRunner) {
				return {
					success: false,
					error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
				};
			}
			const names = params.args.name;
			if (!names) {
				return { success: false, error: "Missing name parameter" };
			}
			const parsedNames = names
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean);
			const result = await quartzRunner.pluginDisable(parsedNames, {
				cwd: plugin.settings.quartzRepoPath,
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return { success: true, data: result.data };
		}

		if (action === "config") {
			const runnerCheck = requireQuartzRunner(plugin);
			if (runnerCheck) {
				return runnerCheck;
			}
			const quartzRunner = plugin.quartzRunner;
			if (!quartzRunner) {
				return {
					success: false,
					error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
				};
			}
			const name = params.args.name;
			if (!name) {
				return { success: false, error: "Missing name parameter" };
			}
			const result = await quartzRunner.pluginConfig(name, {
				cwd: plugin.settings.quartzRepoPath,
				set: params.args.set,
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return { success: true, data: result.data };
		}

		if (action === "prune") {
			const runnerCheck = requireQuartzRunner(plugin);
			if (runnerCheck) {
				return runnerCheck;
			}
			const quartzRunner = plugin.quartzRunner;
			if (!quartzRunner) {
				return {
					success: false,
					error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
				};
			}
			const result = await quartzRunner.pluginPrune({
				cwd: plugin.settings.quartzRepoPath,
				dryRun: params.flags.has("dry-run"),
			});
			if (!result.ok) {
				return { success: false, error: result.error };
			}
			return { success: true, data: result.data };
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
