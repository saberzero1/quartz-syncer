import { PluginIntegration, PatternDescriptor, PatternMatch } from "./types";

function isCanvasPluginEnabled(): boolean {
	const internalPlugins = (globalThis as {
		app?: {
			internalPlugins?: { getPluginById: (id: string) => { enabled?: boolean } | null };
		};
	}).app?.internalPlugins;

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

	assets: {},

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
