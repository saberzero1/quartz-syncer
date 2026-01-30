import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	QuartzAssets,
} from "./types";

function isBasesPluginEnabled(): boolean {
	// @ts-expect-error global app is available in Obsidian
	const internalPlugins = app?.internalPlugins;

	if (!internalPlugins) {
		return false;
	}

	const basesPlugin = internalPlugins.getPluginById("bases");

	return basesPlugin?.enabled ?? false;
}

export const BasesIntegration: PluginIntegration = {
	id: "bases",
	name: "Bases",
	settingKey: "useBases",
	priority: 200,
	category: "core",

	assets: {} as QuartzAssets,

	isAvailable(): boolean {
		return isBasesPluginEnabled();
	},

	getPatterns(): PatternDescriptor[] {
		return [];
	},

	async compile(match: PatternMatch): Promise<string> {
		return match.fullMatch;
	},
};
