import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	QuartzAssets,
} from "./types";
import { isPluginEnabled } from "src/utils/utils";
import { EXCALIDRAW_PLUGIN_ID } from "src/ui/suggest/constants";

export const ExcalidrawIntegration: PluginIntegration = {
	id: "excalidraw",
	name: "Excalidraw",
	settingKey: "useExcalidraw",
	priority: 50,
	category: "community",

	assets: {} as QuartzAssets,

	isAvailable(): boolean {
		return isPluginEnabled(EXCALIDRAW_PLUGIN_ID);
	},

	getPatterns(): PatternDescriptor[] {
		return [];
	},

	async compile(match: PatternMatch): Promise<string> {
		return match.fullMatch;
	},
};
