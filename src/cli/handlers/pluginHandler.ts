import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import {
	createRepositoryAdapter,
	parseCliValue,
} from "src/cli/handlers/cliUtils";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import type { QuartzPluginSource } from "src/quartz/QuartzConfigTypes";

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
		if (!repo) {
			return { success: false, error: "Repository not configured" };
		}

		const configService = new QuartzConfigService(repo);
		const manager = new QuartzPluginManager();

		if (action === "list") {
			const config = await configService.readConfig();
			return { success: true, data: config.plugins };
		}

		if (action === "add") {
			const sourceArg = params.args.source;
			if (!sourceArg) {
				return { success: false, error: "Missing source parameter" };
			}
			const config = await configService.readConfig();
			const source = parsePluginSource(sourceArg);
			const added = manager.addPlugin(config, source);
			await configService.writeConfig(config);
			return { success: true, data: added };
		}

		if (action === "remove") {
			const name = params.args.name;
			if (!name) {
				return { success: false, error: "Missing name parameter" };
			}
			const config = await configService.readConfig();
			const removed = manager.removePlugin(config, name);
			await configService.writeConfig(config);
			return { success: true, data: removed };
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
