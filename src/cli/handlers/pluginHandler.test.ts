import { createPluginHandler } from "./pluginHandler";
import { CliData, CliHandler, RegisterFn } from "../types";
import QuartzSyncer from "main";
import type { PluginUpdateStatus } from "src/quartz/QuartzPluginUpdateChecker";
import type {
	QuartzPluginEntry,
	QuartzV5Config,
} from "src/quartz/QuartzConfigTypes";

const mockReadConfig = jest.fn();
const mockWriteConfig = jest.fn();
const mockReadLockFile = jest.fn();
const mockAddPlugin = jest.fn();
const mockRemovePlugin = jest.fn();
const mockGetPlugins = jest.fn();
const mockCheckUpdates = jest.fn();

jest.mock("src/repositoryConnection/RepositoryConnection", () => ({
	RepositoryConnection: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("src/quartz/QuartzConfigService", () => ({
	QuartzConfigService: jest.fn().mockImplementation(() => ({
		readConfig: mockReadConfig,
		writeConfig: mockWriteConfig,
		readLockFile: mockReadLockFile,
	})),
}));

jest.mock("src/quartz/QuartzPluginManager", () => ({
	QuartzPluginManager: jest.fn().mockImplementation(() => ({
		addPlugin: mockAddPlugin,
		removePlugin: mockRemovePlugin,
		findPlugin: jest.fn(),
	})),
}));

jest.mock("src/quartz/QuartzPluginRegistry", () => ({
	QuartzPluginRegistry: jest.fn().mockImplementation(() => ({
		getPlugins: mockGetPlugins,
	})),
}));

jest.mock("src/quartz/QuartzPluginUpdateChecker", () => ({
	QuartzPluginUpdateChecker: jest.fn().mockImplementation(() => ({
		checkUpdates: mockCheckUpdates,
	})),
}));

const createMockPlugin = (): QuartzSyncer => {
	const settings = {
		git: {
			remoteUrl: "https://github.com/test/repo.git",
			branch: "main",
			auth: { type: "none", secret: "secret123" },
			corsProxyUrl: "",
			providerHint: "",
		},
		contentFolder: "content",
		vaultPath: "/",
		publishFrontmatterKey: "publish",
		useCache: true,
		syncCache: false,
		useDataview: false,
		useDatacore: false,
		useExcalidraw: false,
		useFantasyStatblocks: false,
		useBases: false,
		useCanvas: false,
		useThemes: false,
		frontmatterFormat: "yaml",
		diffViewStyle: "split",
		allNotesPublishableByDefault: false,
		lastUpstreamCommitSha: "abc123",
	};

	return {
		settings,
		getGitSettingsWithSecret: jest.fn().mockReturnValue({
			remoteUrl: "https://github.com/test/repo.git",
			branch: "main",
			auth: { type: "none" },
			corsProxyUrl: "",
		}),
		app: { metadataCache: {}, vault: {} },
	} as unknown as QuartzSyncer;
};

describe("pluginHandler", () => {
	let handler: CliHandler;
	let register: RegisterFn;
	let plugin: QuartzSyncer;

	beforeEach(() => {
		jest.clearAllMocks();
		plugin = createMockPlugin();

		register = (_cmd, _desc, _flags, h) => {
			handler = h;
		};

		createPluginHandler(register, plugin);
	});

	it("lists plugins with status", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [
				{
					source: "github:quartz-community/explorer",
					enabled: true,
					order: 50,
					options: { theme: "dark" },
				},
				{
					source: "github:quartz-community/tag-list",
					enabled: false,
					order: 100,
					options: {},
				},
			],
		};

		mockReadConfig.mockResolvedValue(config);

		const result = await handler({ action: "list" } as CliData);

		expect(result).toContain("explorer [enabled] (order: 50)");
		expect(result).toContain("tag-list [disabled] (order: 100)");
	});

	it("includes source key and options in verbose list", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [
				{
					source: "github:quartz-community/explorer",
					enabled: true,
					order: 50,
					options: { theme: "dark" },
				},
			],
		};

		mockReadConfig.mockResolvedValue(config);

		const result = await handler({
			action: "list",
			verbose: "true",
		} as CliData);

		expect(result).toContain("Source: github:quartz-community/explorer");
		expect(result).toContain('Options: {"theme":"dark"}');
	});

	it("defaults to list when action is missing", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [
				{
					source: "github:quartz-community/explorer",
					enabled: true,
					order: 50,
				},
			],
		};

		mockReadConfig.mockResolvedValue(config);

		const result = await handler({} as CliData);

		expect(result).toContain("explorer [enabled] (order: 50)");
	});

	it("adds a plugin and writes config", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [],
		};

		const entry: QuartzPluginEntry = {
			source: "github:quartz-community/explorer",
			enabled: true,
			order: 50,
			options: {},
		};

		mockReadConfig.mockResolvedValue(config);
		mockAddPlugin.mockReturnValue(entry);

		const result = await handler({
			action: "add",
			source: "github:quartz-community/explorer",
		} as CliData);

		expect(result).toBe("Added plugin explorer.");

		expect(mockWriteConfig).toHaveBeenCalledWith(
			config,
			"Add plugin: explorer",
		);
	});

	it("removes a plugin when forced", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [],
		};

		const entry: QuartzPluginEntry = {
			source: "github:quartz-community/explorer",
			enabled: true,
			order: 50,
			options: {},
		};

		mockReadConfig.mockResolvedValue(config);
		mockRemovePlugin.mockReturnValue(entry);

		const result = await handler({
			action: "remove",
			source: "github:quartz-community/explorer",
			force: "true",
		} as CliData);

		expect(result).toBe("Removed plugin explorer.");

		expect(mockWriteConfig).toHaveBeenCalledWith(
			config,
			"Remove plugin: explorer",
		);
	});

	it("requires force to remove a plugin", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [],
		};

		mockReadConfig.mockResolvedValue(config);

		const result = await handler({
			action: "remove",
			source: "github:quartz-community/explorer",
		} as CliData);

		expect(result).toBe(
			"Error: Removing a plugin requires the 'force' flag.",
		);
	});

	it("returns error when source is missing", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [],
		};

		mockReadConfig.mockResolvedValue(config);

		const addResult = await handler({ action: "add" } as CliData);

		const removeResult = await handler({
			action: "remove",
			force: "true",
		} as CliData);

		expect(addResult).toBe("Error: Missing required flag: source");
		expect(removeResult).toBe("Error: Missing required flag: source");
	});

	it("lists plugin updates", async () => {
		const config: QuartzV5Config = {
			configuration: {} as QuartzV5Config["configuration"],
			plugins: [
				{
					source: "github:quartz-community/explorer",
					enabled: true,
					order: 50,
				},
			],
		};

		const updates: PluginUpdateStatus[] = [
			{
				name: "explorer",
				sourceKey: "github:quartz-community/explorer",
				lockedCommit: "abc",
				remoteCommit: "def",
				hasUpdate: true,
			},
		];

		mockReadConfig.mockResolvedValue(config);
		mockReadLockFile.mockResolvedValue({ version: "1", plugins: {} });
		mockCheckUpdates.mockResolvedValue(updates);

		const result = await handler({ action: "updates" } as CliData);

		expect(result).toContain("explorer [update available]");
		expect(mockCheckUpdates).toHaveBeenCalledTimes(1);
	});

	it("browses registry plugins", async () => {
		mockGetPlugins.mockResolvedValue([
			{
				name: "Explorer",
				description: "Graph view",
				source: "github:quartz-community/explorer",
				tags: ["navigation"],
				official: true,
			},
		]);

		const result = await handler({ action: "browse" } as CliData);

		expect(result).toContain("Explorer - Graph view [official]");
	});
});
