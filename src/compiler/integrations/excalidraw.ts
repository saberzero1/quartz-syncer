import {
	IntegrationCompileResult,
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
} from "./types";
import { isPluginEnabled } from "src/utils/utils";

const EXCALIDRAW_PLUGIN_ID = "obsidian-excalidraw-plugin";

export const ExcalidrawIntegration: PluginIntegration = {
	id: "excalidraw",
	name: "Excalidraw",
	settingKey: "useExcalidraw",
	isVaultDependent: false,
	priority: 50,
	category: "community",

	assets: {},

	isAvailable(): boolean {
		return isPluginEnabled(EXCALIDRAW_PLUGIN_ID);
	},

	getPatterns(): PatternDescriptor[] {
		return [];
	},

	async compile(match: PatternMatch): Promise<IntegrationCompileResult> {
		return { text: match.fullMatch, successful: true };
	},
};
