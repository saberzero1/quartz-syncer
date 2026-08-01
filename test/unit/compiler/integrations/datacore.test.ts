import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DatacoreIntegration } from "src/compiler/integrations/datacore";
import type { PatternMatch } from "src/compiler/integrations/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { DatacoreApi } from "src/compiler/integrations/apis/datacore";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return {
		...actual,
		Component: class {
			load() {}
		},
	};
});

const datacoreMocks = vi.hoisted(() => {
	let pluginEnabled = true;
	const renderPromise = vi.fn().mockResolvedValue(undefined);
	const sanitizeHTMLToString = vi.fn().mockReturnValue("compiled result");
	const surroundWithCalloutBlock = vi.fn((value: string) => value);
	const sanitizeQuery = (query: string) => ({
		isInsideCalloutDepth: 0,
		finalQuery: query,
	});
	const isPluginEnabled = vi.fn(() => pluginEnabled);
	return {
		renderPromise,
		sanitizeHTMLToString,
		surroundWithCalloutBlock,
		sanitizeQuery,
		isPluginEnabled,
		setPluginEnabled: (value: boolean) => {
			pluginEnabled = value;
		},
	};
});

vi.mock("src/utils/utils", () => ({
	isPluginEnabled: datacoreMocks.isPluginEnabled,
	renderPromise: datacoreMocks.renderPromise,
	sanitizeHTMLToString: datacoreMocks.sanitizeHTMLToString,
	surroundWithCalloutBlock: datacoreMocks.surroundWithCalloutBlock,
	sanitizeQuery: datacoreMocks.sanitizeQuery,
}));

const makeApi = (): DatacoreApi => ({
	executeJs: vi.fn(),
	executeJsx: vi.fn(),
	executeTs: vi.fn(),
	executeTsx: vi.fn(),
});

describe("DatacoreIntegration", () => {
	beforeEach(() => {
		datacoreMocks.setPluginEnabled(true);
		datacoreMocks.renderPromise.mockClear();
		datacoreMocks.sanitizeHTMLToString.mockClear();
		datacoreMocks.isPluginEnabled.mockClear();
		const xmlSerializer = class {
			serializeToString() {
				return "";
			}
		};
		(
			globalThis as typeof globalThis & {
				XMLSerializer: typeof XMLSerializer;
			}
		).XMLSerializer = xmlSerializer;
		(
			globalThis as typeof globalThis & {
				createDiv: () => HTMLDivElement;
			}
		).createDiv = () => document.createElement("div") as HTMLDivElement;
	});

	it("pattern matching detects ```datacorejs blocks", () => {
		const patterns = DatacoreIntegration.getPatterns();
		const jsPattern = patterns.find((pattern) => pattern.id === "dc-js");

		expect(jsPattern).toBeDefined();
		expect(
			"```datacorejs\nTABLE\n```".match(jsPattern?.pattern ?? /$^/),
		).not.toBeNull();
	});

	it("compile renders with mock Datacore API", async () => {
		const api = makeApi();
		(window as typeof window & { datacore?: DatacoreApi }).datacore = api;

		const descriptor = DatacoreIntegration.getPatterns().find(
			(pattern) => pattern.id === "dc-js",
		);
		if (!descriptor) {
			throw new Error("Datacore JS pattern not found");
		}

		const match: PatternMatch = {
			descriptor,
			fullMatch: "```datacorejs\nLIST\n```",
			captures: ["LIST"],
		};

		const context = {
			app: new App(),
			file: {
				getPath: () => "notes/test.md",
			} as unknown as PublishFile,
		};

		const result = await DatacoreIntegration.compile(match, context);

		expect(result).toBe("compiled result");
		expect(api.executeJs).toHaveBeenCalled();
		expect(datacoreMocks.renderPromise).toHaveBeenCalled();
		expect(datacoreMocks.sanitizeHTMLToString).toHaveBeenCalled();
	});

	it("isAvailable returns false when Datacore not installed", () => {
		datacoreMocks.setPluginEnabled(false);
		delete (window as typeof window & { datacore?: DatacoreApi }).datacore;

		expect(DatacoreIntegration.isAvailable()).toBe(false);
	});
});
