import { describe, expect, it, vi } from "vitest";
import { PluginCompiler } from "src/compiler/PluginCompiler";
import { App } from "obsidian";
import type QuartzSyncerSettings from "src/models/settings";
import type { PublishFile } from "src/publishFile/PublishFile";
import type {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	QuartzAssets,
} from "src/compiler/integrations/types";
import { integrationRegistry } from "src/compiler/integrations";

vi.mock("src/compiler/integrations", () => ({
	integrationRegistry: {
		getEnabled: vi.fn().mockReturnValue([]),
		getCollectedAssets: () => new Map(),
	},
}));

function makeSettings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return {
		vaultPath: "/",
		useDataview: false,
		useDatacore: false,
		useAutoCardLink: false,
		useFantasyStatblocks: false,
		useBases: false,
		useCanvas: false,
		useExcalidraw: false,
		...overrides,
	} as QuartzSyncerSettings;
}

function makeIntegration(
	patterns: PatternDescriptor[],
	compileFn: (match: PatternMatch) => string,
): PluginIntegration {
	return {
		id: "test-integration",
		name: "Test",
		settingKey: "useDataview",
		priority: 0,
		assets: {} as QuartzAssets,
		category: "core",
		isAvailable: () => true,
		getPatterns: () => patterns,
		compile: async (match: PatternMatch) => compileFn(match),
	};
}

describe("PluginCompiler.compilePatterns", () => {
	it("does not re-match pattern A output with pattern B", async () => {
		const patternA: PatternDescriptor = {
			id: "wrap",
			pattern: /\{\{wrap:(\w+)\}\}/g,
			type: "inline",
		};
		const patternB: PatternDescriptor = {
			id: "div",
			pattern: /<div class="(\w+)">/g,
			type: "inline",
		};

		const bSpy = vi.fn().mockReturnValue("<span>replaced</span>");

		const integration = makeIntegration([patternA, patternB], (match) => {
			if (match.descriptor.id === "wrap") {
				return `<div class="${match.captures[0]}">`;
			}
			return bSpy(match);
		});

		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([
			integration,
		]);

		const compiler = new PluginCompiler(new App(), makeSettings());
		const step = compiler.compile;
		const file = {} as PublishFile;
		const transform = step(file);

		const input = "Hello {{wrap:test}} world";
		const result = await transform(input);

		expect(result).toBe('Hello <div class="test"> world');
		expect(bSpy).not.toHaveBeenCalled();
	});
});
