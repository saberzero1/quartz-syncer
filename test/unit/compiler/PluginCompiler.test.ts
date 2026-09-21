import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginCompiler } from "src/compiler/PluginCompiler";
import { App } from "obsidian";
import type QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";
import type {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	QuartzAssets,
	IntegrationCompileResult,
} from "src/compiler/integrations/types";
import { integrationRegistry } from "src/compiler/integrations";

vi.mock("src/compiler/integrations", () => ({
	integrationRegistry: {
		getEnabled: vi.fn().mockReturnValue([]),
		getVaultDependentEnabled: vi.fn().mockReturnValue([]),
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
	compileFn: (match: PatternMatch) => string | IntegrationCompileResult,
): PluginIntegration {
	return {
		id: "test-integration",
		name: "Test",
		settingKey: "useDataview",
		isVaultDependent: false,
		priority: 0,
		assets: {} as QuartzAssets,
		category: "core",
		isAvailable: () => true,
		getPatterns: () => patterns,
		compile: async (match: PatternMatch) => {
			const result = compileFn(match);

			return typeof result === "string"
				? { text: result, successful: true }
				: result;
		},
	};
}

describe("PluginCompiler.compilePatterns", () => {
	beforeEach(() => {
		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([]);
		vi.mocked(integrationRegistry.getVaultDependentEnabled).mockReturnValue(
			[],
		);
	});

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
		const file = Object.assign(Object.create(PublishFile.prototype), {
			dynamicSources: [],
		}) as PublishFile;
		const transform = step(file);

		const input = "Hello {{wrap:test}} world";
		const result = await transform(input);

		expect(result).toBe('Hello <div class="test"> world');
		expect(bSpy).not.toHaveBeenCalled();
	});

	it("does not demote a detected dynamic note while an integration is unavailable", async () => {
		const unavailable: PluginIntegration = {
			...makeIntegration([], () => ""),
			isVaultDependent: true,
			isAvailable: vi.fn().mockReturnValue(false),
		};
		vi.mocked(integrationRegistry.getVaultDependentEnabled).mockReturnValue(
			[unavailable],
		);
		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([]);
		const file = Object.assign(Object.create(PublishFile.prototype), {
			dynamicSources: ["unavailable"],
		}) as PublishFile;

		await new PluginCompiler(new App(), makeSettings()).compile(file)(
			"static",
		);

		expect(file.hasDynamicContent).toBe(true);
	});

	it("promotes a note when a vault-dependent integration fires", async () => {
		const integration: PluginIntegration = {
			...makeIntegration(
				[
					{
						id: "dynamic",
						pattern: /\{\{dynamic\}\}/g,
						type: "inline",
					},
				],
				() => "rendered",
			),
			isVaultDependent: true,
		};
		vi.mocked(integrationRegistry.getVaultDependentEnabled).mockReturnValue(
			[integration],
		);
		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([
			integration,
		]);
		const file = Object.assign(Object.create(PublishFile.prototype), {
			dynamicSources: [],
		}) as PublishFile;

		await new PluginCompiler(new App(), makeSettings()).compile(file)(
			"{{dynamic}}",
		);

		expect(file.hasDynamicContent).toBe(true);
	});

	it("does not treat a transformFile integration as successfully executed", async () => {
		const integration: PluginIntegration = {
			...makeIntegration([], () => ""),
			id: "dataview",
			isVaultDependent: true,
			shouldTransformFile: () => true,
			transformFile: async () => "transformed output",
		};
		vi.mocked(integrationRegistry.getVaultDependentEnabled).mockReturnValue(
			[integration],
		);
		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([
			integration,
		]);
		const file = Object.assign(Object.create(PublishFile.prototype), {
			dynamicSources: ["dataview"],
		}) as PublishFile;

		const result = await new PluginCompiler(
			new App(),
			makeSettings(),
		).compileWithEvidence(file)("original");

		expect(result.text).toBe("transformed output");
		expect([...result.successfulVaultDependentExecutions]).toEqual([]);
		expect(file.dynamicSources).toEqual(["dataview"]);
	});

	it("does not make a failed integration eligible for a persisted revision", async () => {
		const integration: PluginIntegration = {
			...makeIntegration(
				[
					{
						id: "dynamic",
						pattern: /\{\{dynamic\}\}/g,
						type: "inline",
					},
				],
				(match) => ({ text: match.fullMatch, successful: false }),
			),
			id: "dataview",
			isVaultDependent: true,
		};
		vi.mocked(integrationRegistry.getVaultDependentEnabled).mockReturnValue(
			[integration],
		);
		vi.mocked(integrationRegistry.getEnabled).mockReturnValue([
			integration,
		]);
		const file = Object.assign(Object.create(PublishFile.prototype), {
			dynamicSources: ["dataview"],
		}) as PublishFile;

		const result = await new PluginCompiler(
			new App(),
			makeSettings(),
		).compileWithEvidence(file)("{{dynamic}}");

		expect(result.successfulVaultDependentExecutions.has("dataview")).toBe(
			false,
		);
		expect([...result.successfulVaultDependentExecutions]).toEqual([]);
		expect(file.dynamicSources).toEqual(["dataview"]);
	});
});
