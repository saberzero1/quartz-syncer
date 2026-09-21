import { beforeEach, describe, expect, it, vi } from "vitest";
import type QuartzSyncerSettings from "src/models/settings";
import type { DataviewApi } from "src/compiler/integrations/apis/dataview";
import {
	getDataviewApi,
	getEffectiveDataviewSyntax,
} from "src/compiler/integrations/apis/dataview";
import { hasDynamicContent } from "src/utils/dynamicContent";
import { integrationRegistry } from "src/compiler/integrations";
import type { PluginIntegration } from "src/compiler/integrations/types";

vi.mock("src/compiler/integrations/apis/dataview", () => ({
	getDataviewApi: vi.fn(),
	getEffectiveDataviewSyntax: vi.fn(),
	isDataviewSyntaxResolved: vi.fn().mockReturnValue(true),
}));

const mockedGetDataviewApi = vi.mocked(getDataviewApi);
const mockedGetEffectiveDataviewSyntax = vi.mocked(getEffectiveDataviewSyntax);

function makeSettings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return {
		useDataview: false,
		useDatacore: false,
		useFantasyStatblocks: false,
		useAutoCardLink: false,
		useExcalidraw: false,
		useBases: false,
		useCanvas: false,
		...overrides,
	} as QuartzSyncerSettings;
}

describe("hasDynamicContent", () => {
	beforeEach(() => {
		mockedGetDataviewApi.mockReset();
		mockedGetDataviewApi.mockReturnValue(undefined);
		mockedGetEffectiveDataviewSyntax.mockReturnValue({
			dataviewJsKeyword: "dataviewjs",
			inlineQueryPrefix: "=",
			inlineJsQueryPrefix: "$=",
		});
	});

	it("detects Fantasy Statblocks only when enabled", () => {
		const text = "```statblock\nname: Goblin\n```";

		expect(
			hasDynamicContent(
				text,
				makeSettings({ useFantasyStatblocks: true }),
			),
		).toBe(true);
		expect(hasDynamicContent(text, makeSettings())).toBe(false);
	});

	it("detects Auto Card Link only when enabled", () => {
		const text = "```cardlink\nurl: https://example.com\n```";

		expect(
			hasDynamicContent(text, makeSettings({ useAutoCardLink: true })),
		).toBe(true);
		expect(hasDynamicContent(text, makeSettings())).toBe(false);
	});

	it("detects tilde Dataview fences", () => {
		expect(
			hasDynamicContent(
				"~~~dataview\nLIST\n~~~",
				makeSettings({ useDataview: true }),
			),
		).toBe(true);
	});

	it("detects default inline Dataview queries before the API initializes", () => {
		expect(
			hasDynamicContent(
				"Value: `= this.file.name `",
				makeSettings({ useDataview: true }),
			),
		).toBe(true);
	});

	it("detects patterns without consulting integration availability", () => {
		const isAvailable = vi.fn().mockReturnValue(false);
		const integration: PluginIntegration = {
			id: "unavailable-dynamic",
			name: "Unavailable dynamic",
			settingKey: "useDataview",
			isVaultDependent: true,
			priority: 0,
			assets: {},
			category: "community",
			isAvailable,
			getPatterns: () => [
				{
					id: "unavailable-pattern",
					pattern: /\{\{vault-query\}\}/g,
					type: "inline",
				},
			],
			compile: async (match) => match.fullMatch,
		};
		const selector = vi
			.spyOn(integrationRegistry, "getVaultDependentEnabled")
			.mockReturnValue([integration]);

		try {
			expect(hasDynamicContent("{{vault-query}}", makeSettings())).toBe(
				true,
			);
			expect(isAvailable).not.toHaveBeenCalled();
		} finally {
			selector.mockRestore();
		}
	});

	it("uses configured Dataview pattern values when available", () => {
		mockedGetDataviewApi.mockReturnValue({
			settings: {
				dataviewJsKeyword: "datajs",
				inlineQueryPrefix: "dv=",
				inlineJsQueryPrefix: "js=",
			},
		} as DataviewApi);
		mockedGetEffectiveDataviewSyntax.mockReturnValue({
			dataviewJsKeyword: "datajs",
			inlineQueryPrefix: "dv=",
			inlineJsQueryPrefix: "js=",
		});

		expect(
			hasDynamicContent(
				"Value: `dv= this.file.name`",
				makeSettings({ useDataview: true }),
			),
		).toBe(true);
	});

	it("does not match uppercase Dataview fences", () => {
		expect(
			hasDynamicContent(
				"```DATAVIEW\nLIST\n```",
				makeSettings({ useDataview: true }),
			),
		).toBe(false);
	});

	it("does not let an inline query cross lines or match an arrow", () => {
		const text = "`=>`\nSome unrelated text and later `inline code`";

		expect(
			hasDynamicContent(text, makeSettings({ useDataview: true })),
		).toBe(false);
	});

	it("ignores inline examples inside fenced documentation", () => {
		const text = "```markdown\n`= this.file.name`\n```";

		expect(
			hasDynamicContent(text, makeSettings({ useDataview: true })),
		).toBe(false);
	});

	it("detects consecutive notes correctly with the cached global patterns", () => {
		const settings = makeSettings({ useDataview: true });
		const notes = Array.from(
			{ length: 4 },
			(_, index) => `Note ${index}: \`= this.file.name\``,
		);

		expect(notes.map((note) => hasDynamicContent(note, settings))).toEqual([
			true,
			true,
			true,
			true,
		]);
	});
});
