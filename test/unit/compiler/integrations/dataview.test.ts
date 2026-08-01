import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DataviewIntegration } from "src/compiler/integrations/dataview";
import type { PatternMatch } from "src/compiler/integrations/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { DataviewApi } from "src/compiler/integrations/apis/dataview";
import { getDataviewApi } from "src/compiler/integrations/apis/dataview";

vi.mock("src/utils/utils", async () => {
	const actual =
		await vi.importActual<typeof import("src/utils/utils")>(
			"src/utils/utils",
		);
	return {
		...actual,
		cleanQueryResult: (value: string) => value,
		renderPromise: vi.fn().mockResolvedValue(undefined),
		surroundWithCalloutBlock: vi.fn((value: string) => value),
		sanitizeQuery: (query: string) => ({
			isInsideCalloutDepth: 0,
			finalQuery: query,
		}),
	};
});

vi.mock("src/compiler/integrations/apis/dataview", () => ({
	getDataviewApi: vi.fn(),
}));

const mockedGetDataviewApi = vi.mocked(getDataviewApi);

const makeApi = (): DataviewApi => ({
	settings: {
		dataviewJsKeyword: "dataviewjs",
		inlineQueryPrefix: "=",
		inlineJsQueryPrefix: "$=",
	},
	tryQueryMarkdown: vi.fn().mockResolvedValue(""),
	tryEvaluate: vi.fn().mockReturnValue(""),
	executeJs: vi.fn(),
	page: vi.fn().mockReturnValue({}),
});

describe("DataviewIntegration", () => {
	beforeEach(() => {
		mockedGetDataviewApi.mockReset();
	});

	it("pattern matching detects ```dataview blocks", () => {
		mockedGetDataviewApi.mockReturnValue(makeApi());

		const patterns = DataviewIntegration.getPatterns();
		const blockPattern = patterns.find(
			(pattern) => pattern.id === "dv-block",
		);

		expect(blockPattern).toBeDefined();
		expect(
			"```dataview\nTABLE\n```".match(blockPattern?.pattern ?? /$^/),
		).not.toBeNull();
	});

	it("pattern matching detects inline `= ` queries", () => {
		mockedGetDataviewApi.mockReturnValue(makeApi());

		const patterns = DataviewIntegration.getPatterns();
		const inlinePattern = patterns.find(
			(pattern) => pattern.id === "dv-inline",
		);

		expect(inlinePattern).toBeDefined();
		expect(
			"Inline `= 1 + 1`".match(inlinePattern?.pattern ?? /$^/),
		).not.toBeNull();
	});

	it("compile renders with mock Dataview API", async () => {
		const api = makeApi();
		api.tryQueryMarkdown = vi.fn().mockResolvedValue("Rendered markdown");
		mockedGetDataviewApi.mockReturnValue(api);

		const descriptor = DataviewIntegration.getPatterns().find(
			(pattern) => pattern.id === "dv-block",
		);
		if (!descriptor) {
			throw new Error("Dataview block pattern not found");
		}

		const match: PatternMatch = {
			descriptor,
			fullMatch: "```dataview\nLIST\n```",
			captures: ["LIST"],
		};

		const context = {
			app: new App(),
			file: {
				getPath: () => "notes/test.md",
			} as unknown as PublishFile,
		};

		const result = await DataviewIntegration.compile(match, context);

		expect(result).toBe("Rendered markdown");
		expect(api.tryQueryMarkdown).toHaveBeenCalledWith(
			"LIST",
			"notes/test.md",
		);
	});

	it("compile handles API not available gracefully", async () => {
		mockedGetDataviewApi.mockReturnValue(undefined);

		const descriptor = DataviewIntegration.getPatterns().find(
			(pattern) => pattern.id === "dv-block",
		);
		if (!descriptor) {
			throw new Error("Dataview block pattern not found");
		}

		const match: PatternMatch = {
			descriptor,
			fullMatch: "```dataview\nTABLE\n```",
			captures: ["TABLE"],
		};

		const context = {
			app: new App(),
			file: {
				getPath: () => "notes/test.md",
			} as unknown as PublishFile,
		};

		const result = await DataviewIntegration.compile(match, context);

		expect(result).toBe(match.fullMatch);
	});

	it("isAvailable returns false when Dataview plugin not installed", () => {
		mockedGetDataviewApi.mockReturnValue(undefined);

		expect(DataviewIntegration.isAvailable()).toBe(false);
	});
});
