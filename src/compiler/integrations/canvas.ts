import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	QuartzAssets,
} from "./types";

function isCanvasPluginEnabled(): boolean {
	// @ts-expect-error global app is available in Obsidian
	const internalPlugins = app?.internalPlugins;

	if (!internalPlugins) {
		return false;
	}

	const canvasPlugin = internalPlugins.getPluginById("canvas");

	return canvasPlugin?.enabled ?? false;
}

export const CanvasIntegration: PluginIntegration = {
	id: "canvas",
	name: "Canvas",
	settingKey: "useCanvas",
	priority: 200,
	category: "core",

	assets: {} as QuartzAssets,

	isAvailable(): boolean {
		return isCanvasPluginEnabled();
	},

	getPatterns(): PatternDescriptor[] {
		return [];
	},

	async compile(match: PatternMatch): Promise<string> {
		return match.fullMatch;
	},
};
