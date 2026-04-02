import { createCacheHandler } from "./cacheHandler";
import { CliData, CliHandler, RegisterFn } from "../types";
import type QuartzSyncer from "main";

jest.mock("obsidian", () => ({
	normalizePath: (p: string) => p.replace(/\\/g, "/").replace(/^\//, ""),
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
			auth: {},
			corsProxyUrl: "",
		}),
		datastore: {
			allFiles: jest.fn().mockResolvedValue(["file1.md", "file2.md"]),
			getLastUpdateTimestamp: jest.fn().mockResolvedValue(1700000000000),
			setLastUpdateTimestamp: jest.fn().mockResolvedValue(undefined),
			recreate: jest.fn().mockResolvedValue(undefined),
			persister: { removeItem: jest.fn().mockResolvedValue(undefined) },
			fileKey: jest.fn((path: string) => `file:${path}`),
		},
		saveSettings: jest.fn().mockResolvedValue(undefined),
		app: { metadataCache: {}, vault: {} },
	} as unknown as QuartzSyncer;
};

describe("cacheHandler", () => {
	let handler: CliHandler;
	let register: RegisterFn;
	let plugin: QuartzSyncer;

	beforeEach(() => {
		plugin = createMockPlugin();

		register = (_cmd, _desc, _flags, h) => {
			handler = h;
		};
		createCacheHandler(register, plugin);
	});

	it("returns status with file count and last updated", async () => {
		const result = await handler({ action: "status" } as CliData);

		expect(result).toBe("Cache contains 2 files.");
		expect(plugin.datastore?.allFiles).toHaveBeenCalledTimes(1);

		expect(plugin.datastore?.getLastUpdateTimestamp).toHaveBeenCalledTimes(
			1,
		);
	});

	it("includes file paths in verbose text mode", async () => {
		const result = await handler({
			action: "status",
			verbose: "true",
		} as CliData);

		expect(result).toContain("file1.md");
		expect(result).toContain("file2.md");
	});

	it("clears a specific file and updates timestamp", async () => {
		const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000001);

		const result = await handler({
			action: "clear",
			path: "file1.md",
		} as CliData);

		expect(result).toBe("Cache cleared for file1.md.");

		expect(plugin.datastore?.persister.removeItem).toHaveBeenCalledWith(
			"file:file1.md",
		);

		expect(plugin.datastore?.setLastUpdateTimestamp).toHaveBeenCalledWith(
			1700000000001,
			plugin,
		);

		nowSpy.mockRestore();
	});

	it("returns error when clear action missing path", async () => {
		const result = await handler({ action: "clear" } as CliData);

		expect(result).toBe("Error: Missing required flag: path");
	});

	it("clears all cache when forced", async () => {
		const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000002);

		const result = await handler({
			action: "clear-all",
			force: "true",
		} as CliData);

		expect(result).toBe("Cache cleared for all files.");
		expect(plugin.datastore?.recreate).toHaveBeenCalledTimes(1);

		expect(plugin.datastore?.setLastUpdateTimestamp).toHaveBeenCalledWith(
			1700000000002,
			plugin,
		);

		nowSpy.mockRestore();
	});

	it("returns error when clear-all lacks force", async () => {
		const result = await handler({ action: "clear-all" } as CliData);

		expect(result).toBe(
			"Error: Clearing all cache requires the 'force' flag.",
		);
	});

	it("returns error when cache is disabled", async () => {
		plugin.settings.useCache = false;

		const result = await handler({ action: "status" } as CliData);

		expect(result).toBe("Error: Cache is disabled.");
	});

	it("returns error when action is missing", async () => {
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Missing required flag: action");
	});

	it("returns error for invalid action", async () => {
		const result = await handler({ action: "bogus" } as CliData);

		expect(result).toBe(
			"Error: Invalid action. Use status, clear, or clear-all.",
		);
	});

	it("returns JSON output when format=json", async () => {
		const result = await handler({
			action: "status",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			data?: { count?: number };
		};

		expect(parsed.ok).toBe(true);
		expect(parsed.data?.count).toBe(2);
	});
});
