import { PluginIntegration, PatternDescriptor, PatternMatch } from "./types";

function isCanvasPluginEnabled(): boolean {
	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- global app is only way to access internal plugins */
	// @ts-expect-error global app is available in Obsidian
	// eslint-disable-next-line no-restricted-globals, no-undef -- global app is only way to access internal plugins
	const internalPlugins = app?.internalPlugins;

	if (!internalPlugins) {
		return false;
	}

	const canvasPlugin = internalPlugins.getPluginById("canvas");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- internal plugin API is untyped
	return canvasPlugin?.enabled ?? false;
	/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- end internal plugin API access */
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
