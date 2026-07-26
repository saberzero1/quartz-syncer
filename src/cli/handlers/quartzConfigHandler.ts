import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import {
	createRepositoryAdapter,
	getValueByPath,
	parseCliValue,
	setValueByPath,
} from "src/cli/handlers/cliUtils";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";

const DEFAULT_ACTION = "list";

export function createQuartzConfigHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;
		const repo = createRepositoryAdapter(plugin);
		if (!repo) {
			return { success: false, error: "Repository not configured" };
		}

		const configService = new QuartzConfigService(repo);
		const config = await configService.readConfig();
		const configRecord = config as unknown as Record<string, unknown>;

		if (action === "list") {
			return { success: true, data: config };
		}

		if (action === "get") {
			const key = params.args.key;
			if (!key) {
				return { success: false, error: "Missing key parameter" };
			}
			const value = getValueByPath(configRecord, key);
			if (value === undefined) {
				return {
					success: false,
					error: `Config key not found: ${key}`,
				};
			}
			return { success: true, data: { key, value } };
		}

		if (action === "set") {
			const key = params.args.key;
			const rawValue = params.args.value;
			if (!key) {
				return { success: false, error: "Missing key parameter" };
			}
			if (rawValue === undefined) {
				return { success: false, error: "Missing value parameter" };
			}
			const value = parseCliValue(rawValue);
			setValueByPath(configRecord, key, value);
			await configService.writeConfig(config);
			return { success: true, data: { key, value } };
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
