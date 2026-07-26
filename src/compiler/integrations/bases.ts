import { PluginIntegration, PatternDescriptor, PatternMatch } from "./types";

function isBasesPluginEnabled(): boolean {
	const internalPlugins = (window as {
		app?: {
			internalPlugins?: { getPluginById: (id: string) => { enabled?: boolean } | null };
		};
	}).app?.internalPlugins;

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

	assets: {},

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
