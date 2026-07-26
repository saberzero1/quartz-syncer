import { TFile } from "obsidian";
import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

export function createMarkHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const path = params.args.path;
		if (!path) {
			return { success: false, error: "Missing path parameter" };
		}

		const file = _plugin.app.vault.getFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `File not found: ${path}` };
		}

		const engine = new ObsidianFrontMatterEngine(
			_plugin.app.vault,
			_plugin.app.metadataCache,
			file,
			_plugin.app.fileManager,
		);
		const key = _plugin.settings.publishFrontmatterKey;
		const currentValue = Boolean(engine.get(key));
		const rawState =
			params.args.state ??
			(params.flags.has("toggle") ? "toggle" : undefined);
		const state = rawState?.toLowerCase();

		let nextValue: boolean | null = null;
		if (!state || state === "toggle") {
			nextValue = !currentValue;
			engine.set(key, nextValue);
		} else if (
			["true", "on", "yes", "1", "set", "publish"].includes(state)
		) {
			nextValue = true;
			engine.set(key, true);
		} else if (["false", "off", "no", "0"].includes(state)) {
			nextValue = false;
			engine.set(key, false);
		} else if (["unset", "remove", "clear"].includes(state)) {
			nextValue = null;
			engine.remove(key);
		} else {
			return { success: false, error: `Unknown state: ${rawState}` };
		}

		await engine.apply();

		return {
			success: true,
			data: {
				path,
				publish: nextValue === null ? "removed" : nextValue,
			},
		};
	};
}
