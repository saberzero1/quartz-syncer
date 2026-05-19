import { createConfigHandler } from "./configHandler";
import { CliData, CliHandler, RegisterFn } from "../types";
import type QuartzSyncer from "main";

jest.mock("obsidian", () => ({
	normalizePath: (path: string) => path,
}));

const createMockPlugin = (): QuartzSyncer => {
	const settings = {
		gitRemoteUrl: "https://github.com/test/repo.git",
		gitBranch: "main",
		gitAuthType: "none",
		gitAuthUsername: "",
		gitCorsProxyUrl: "",
		gitProviderHint: "",
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
			auth: { type: "basic", secret: "test-token" },
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

describe("configHandler", () => {
	let handler: CliHandler;
	let register: RegisterFn;
	let plugin: QuartzSyncer;

	beforeEach(() => {
		plugin = createMockPlugin();

		register = (_cmd, _desc, _flags, h) => {
			handler = h;
		};
		createConfigHandler(register, plugin);
	});

	it("lists settings with redacted secret", async () => {
		const result = await handler({
			action: "list",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			data: { gitAuthSecret?: string };
		};

		expect(parsed.ok).toBe(true);
		expect(parsed.data.gitAuthSecret).toBe("***");
	});

	it("lists settings as key/value lines in verbose text mode", async () => {
		const result = await handler({
			action: "list",
			verbose: "true",
		} as CliData);

		expect(result).toContain('gitBranch="main"');
		expect(result).toContain("useCache=true");
	});

	it("gets a config value by key", async () => {
		const result = await handler({
			action: "get",
			key: "gitBranch",
		} as CliData);

		expect(result).toBe('gitBranch="main"');
	});

	it("redacts git.auth.secret when requested", async () => {
		const result = await handler({
			action: "get",
			key: "git.auth.secret",
		} as CliData);

		expect(result).toBe('git.auth.secret="***"');
	});

	it("returns error for unknown key", async () => {
		const result = await handler({
			action: "get",
			key: "gitNope",
		} as CliData);

		expect(result).toBe("Error: Unknown setting key.");
	});

	it("sets writable keys and saves settings", async () => {
		plugin.settings.gitBranch = "develop";

		const result = await handler({
			action: "set",
			key: "gitBranch",
			value: "main",
		} as CliData);

		expect(result).toBe("Updated gitBranch.");
		expect(plugin.settings.gitBranch).toBe("main");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("blocks setting git.auth.secret", async () => {
		const result = await handler({
			action: "set",
			key: "git.auth.secret",
			value: "new-secret",
		} as CliData);

		expect(result).toBe("Error: git.auth.secret cannot be set via CLI.");
	});

	it("returns error for non-writable keys", async () => {
		const result = await handler({
			action: "set",
			key: "lastUpstreamCommitSha",
			value: "nope",
		} as CliData);

		expect(result).toBe("Error: Setting is not writable via CLI.");
	});

	it("returns error for invalid boolean values", async () => {
		const result = await handler({
			action: "set",
			key: "useCache",
			value: "maybe",
		} as CliData);

		expect(result).toBe(
			"Error: Invalid value for useCache. Expected boolean.",
		);
	});

	it("defaults to list when action is missing", async () => {
		const result = await handler({} as CliData);

		expect(result).toContain("gitBranch=");
	});

	it("returns JSON output when format=json", async () => {
		const result = await handler({
			action: "get",
			key: "gitBranch",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			data: { key: string; value: string };
		};

		expect(parsed.ok).toBe(true);
		expect(parsed.data).toEqual({ key: "gitBranch", value: "main" });
	});
});
