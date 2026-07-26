import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import {
	getValueByPath,
	parseCliValue,
	setValueByPath,
} from "src/cli/handlers/cliUtils";

const DEFAULT_ACTION = "list";

export function createConfigHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;
		const settings = plugin.settings as unknown as Record<string, unknown>;

		if (action === "list") {
			return { success: true, data: settings };
		}

		if (action === "get") {
			const key = params.args.key;
			if (!key) {
				return { success: false, error: "Missing key parameter" };
			}
			const value = getValueByPath(settings, key);
			if (value === undefined) {
				return { success: false, error: `Setting not found: ${key}` };
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
			setValueByPath(settings, key, value);
			await plugin.saveSettings();
			return { success: true, data: { key, value } };
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
