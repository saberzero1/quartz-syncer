import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, MetadataCache, TFile, Vault } from "obsidian";
import { DataviewIntegration } from "src/compiler/integrations/dataview";
import type { PatternMatch } from "src/compiler/integrations/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { DataviewApi } from "src/compiler/integrations/apis/dataview";
import {
	getDataviewApi,
	getEffectiveDataviewSyntax,
} from "src/compiler/integrations/apis/dataview";
import { PublishFile as PublishFileImpl } from "src/publishFile/PublishFile";
import type QuartzSyncerSettings from "src/models/settings";
import type { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import type { DataStore } from "src/cache/DataStore";
import { PluginCompiler } from "src/compiler/PluginCompiler";
import { integrationRegistry } from "src/compiler/integrations";

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
	getEffectiveDataviewSyntax: vi.fn(),
	isDataviewSyntaxResolved: vi.fn().mockReturnValue(true),
}));

const mockedGetDataviewApi = vi.mocked(getDataviewApi);
const mockedGetEffectiveDataviewSyntax = vi.mocked(getEffectiveDataviewSyntax);

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

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings =>
	({
		vaultPath: "/",
		useExcalidraw: false,
		useDataview: true,
		usePermalink: false,
		includeAllFrontmatter: false,
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		showPublishedTimestamp: false,
		publishFrontmatterKey: "publish",
		allNotesPublishableByDefault: false,
		contentFolder: "content",
		createdTimestampKey: "created",
		updatedTimestampKey: "updated",
		publishedTimestampKey: "published",
		timestampFormat: "YYYY-MM-DD",
		frontmatterFormat: "yaml",
		useCache: false,
		autoCleanOrphanedMedia: false,
		syncCache: false,
		persistCache: false,
		cacheTimestamp: 0,
		cache: "",
		useAutoCardLink: false,
		useDatacore: false,
		useFantasyStatblocks: false,
		useBases: false,
		useCanvas: false,
		manageSyncerStyles: false,
		noteSettingsIsInitialized: false,
		lastUsedSettingsTab: "",
		pluginVersion: "0.0.0",
		diffViewStyle: "auto",
		gitRemoteUrl: "",
		gitBranch: "main",
		gitAuthType: "none",
		gitAuthUsername: "",
		gitCorsProxyUrl: "",
		gitProviderHint: "github",
		settingsSchemaVersion: 0,
		...overrides,
	}) as QuartzSyncerSettings;

const makePublishFile = (
	frontmatter: Record<string, unknown> = {},
	settingsOverrides: Partial<QuartzSyncerSettings> = {},
) => {
	const file = new TFile();
	file.path = "notes/test.md";
	file.name = "test.md";
	file.extension = "md";
	file.stat = { mtime: 0, ctime: 0, size: 0 };

	const metadataCache = new MetadataCache();
	metadataCache.getCache = vi.fn().mockReturnValue({ frontmatter });

	const vault = new Vault();
	const compiler = {} as SyncerPageCompiler;
	const datastore = {} as DataStore;

	return new PublishFileImpl({
		file,
		compiler,
		metadataCache,
		vault,
		settings: makeSettings(settingsOverrides),
		datastore,
	});
};

describe("DataviewIntegration", () => {
	beforeEach(() => {
		mockedGetDataviewApi.mockReset();
		mockedGetEffectiveDataviewSyntax.mockReturnValue({
			dataviewJsKeyword: "dataviewjs",
			inlineQueryPrefix: "=",
			inlineJsQueryPrefix: "$=",
		});
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

	it("returns all pattern ids when the Dataview API is unavailable", () => {
		mockedGetDataviewApi.mockReturnValue(undefined);

		expect(
			DataviewIntegration.getPatterns().map((pattern) => pattern.id),
		).toEqual(["dv-block", "dv-js-block", "dv-inline", "dv-inline-js"]);
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

	it("inline pattern does not match highlight syntax adjacent to inline code", () => {
		mockedGetDataviewApi.mockReturnValue(makeApi());

		const patterns = DataviewIntegration.getPatterns();
		const inlinePattern = patterns.find(
			(pattern) => pattern.id === "dv-inline",
		);

		expect(inlinePattern).toBeDefined();
		const regex = inlinePattern?.pattern ?? /$^/;

		// These use Obsidian highlight ==text== adjacent to inline code `code`
		// and must NOT be detected as Dataview inline expressions
		expect(
			"`IUnknown`==is the only COM interface==`IUnknown`".match(regex),
		).toBeNull();
		expect("`IUnknown`==or==`IUserInfo`".match(regex)).toBeNull();
		expect("`IUnknown`==, ==`IUserInfo`".match(regex)).toBeNull();
		expect("`QueryInterface` ==calls ==`AddRef`".match(regex)).toBeNull();
	});

	it("inline pattern still matches legitimate Dataview queries", () => {
		mockedGetDataviewApi.mockReturnValue(makeApi());

		const patterns = DataviewIntegration.getPatterns();
		const inlinePattern = patterns.find(
			(pattern) => pattern.id === "dv-inline",
		);

		expect(inlinePattern).toBeDefined();
		const regex = inlinePattern?.pattern ?? /$^/;

		expect("Value: `= this.file.name`".match(regex)).not.toBeNull();
		expect("`= date(today)`".match(regex)).not.toBeNull();
		expect("(`= this.field`)".match(regex)).not.toBeNull();
		expect("`= 1 == 2`".match(regex)).not.toBeNull();
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

		expect(result.text).toBe("Rendered markdown");
		expect(result.successful).toBe(true);
		expect(api.tryQueryMarkdown).toHaveBeenCalledWith(
			"LIST",
			"notes/test.md",
		);
	});

	it("compiles a multi-line Dataview block", async () => {
		const api = makeApi();
		api.tryQueryMarkdown = vi.fn().mockResolvedValue("Rendered markdown");
		mockedGetDataviewApi.mockReturnValue(api);
		const enabledSpy = vi
			.spyOn(integrationRegistry, "getEnabled")
			.mockReturnValue([DataviewIntegration]);
		const dynamicSpy = vi
			.spyOn(integrationRegistry, "getVaultDependentEnabled")
			.mockReturnValue([DataviewIntegration]);
		const publishFile = Object.assign(
			Object.create(PublishFileImpl.prototype),
			{
				dynamicSources: ["dataview"],
				getPath: () => "notes/test.md",
			},
		) as PublishFileImpl;

		try {
			const result = await new PluginCompiler(
				new App(),
				makeSettings(),
			).compile(publishFile)(
				'```dataview\nTABLE file.name\nFROM "notes"\n```',
			);

			expect(result).toBe("Rendered markdown");
			expect(api.tryQueryMarkdown).toHaveBeenCalledWith(
				expect.stringContaining('TABLE file.name\nFROM "notes"'),
				"notes/test.md",
			);
		} finally {
			enabledSpy.mockRestore();
			dynamicSpy.mockRestore();
		}
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

		expect(result.text).toBe(match.fullMatch);
		expect(result.successful).toBe(false);
	});

	it("isAvailable returns false when Dataview plugin not installed", () => {
		mockedGetDataviewApi.mockReturnValue(undefined);

		expect(DataviewIntegration.isAvailable()).toBe(false);
	});

	it("renders inline fields as static frontmatter entries", () => {
		const publishFile = makePublishFile(
			{},
			{
				useDataview: true,
				includeAllFrontmatter: true,
			},
		);

		const compiled = publishFile.getCompiledFrontmatter("key:: value");

		expect(compiled).toContain("key: value");
	});

	it("renders inline fields with colons in values", () => {
		const publishFile = makePublishFile(
			{},
			{
				useDataview: true,
				includeAllFrontmatter: true,
			},
		);

		const compiled = publishFile.getCompiledFrontmatter(
			"key:: value: with colons",
		);

		expect(compiled).toContain('key: "value: with colons"');
	});

	it("renders multiple inline fields in the same note", () => {
		const publishFile = makePublishFile(
			{},
			{
				useDataview: true,
				includeAllFrontmatter: true,
			},
		);

		const compiled = publishFile.getCompiledFrontmatter(
			"one:: first\ntext\n[inline:: second]",
		);

		expect(compiled).toContain("one: first");
		expect(compiled).toContain("inline: second");
	});
});
