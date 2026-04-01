import { createUpgradeHandler } from "./upgradeHandler";
import { CliData, CliHandler, RegisterFn } from "../types";
import { validatePreFlight } from "src/cli/validators";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type QuartzSyncer from "main";

const mockHasCommitInHistory = jest.fn();
const mockUpgradeFromUpstream = jest.fn();

jest.mock("src/cli/validators", () => ({
	validatePreFlight: jest.fn(),
}));

jest.mock("src/repositoryConnection/RepositoryConnection", () => ({
	RepositoryConnection: jest.fn().mockImplementation(() => ({
		hasCommitInHistory: mockHasCommitInHistory,
		upgradeFromUpstream: mockUpgradeFromUpstream,
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

describe("upgradeHandler", () => {
	let handler: CliHandler;
	let register: RegisterFn;
	let plugin: QuartzSyncer;

	beforeEach(() => {
		plugin = createMockPlugin();

		register = (_cmd, _desc, _flags, h) => {
			handler = h;
		};
		createUpgradeHandler(register, plugin);
		jest.clearAllMocks();
		(validatePreFlight as jest.Mock).mockReturnValue(null);
		mockHasCommitInHistory.mockResolvedValue(true);

		mockUpgradeFromUpstream.mockResolvedValue({
			alreadyMerged: false,
			oid: "def456",
		});
	});

	it("dry-run checks history when lastUpstreamCommitSha is set", async () => {
		const result = await handler({
			"dry-run": "true",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			message?: string;
			data?: { lastUpstreamCommitSha?: string; alreadyMerged?: boolean };
		};

		expect(mockHasCommitInHistory).toHaveBeenCalledWith("abc123");
		expect(parsed.ok).toBe(true);
		expect(parsed.data?.alreadyMerged).toBe(true);
		expect(parsed.message).toBe("Already up to date.");
	});

	it("includes upstream details in verbose text mode", async () => {
		const result = await handler({
			"dry-run": "true",
			verbose: "true",
		} as CliData);

		expect(result).toContain(
			"Upstream: https://github.com/jackyzha0/quartz.git#v5",
		);
		expect(result).toContain("Recorded SHA: abc123");
	});

	it("dry-run reports missing upstream commit", async () => {
		plugin.settings.lastUpstreamCommitSha = "";

		const result = await handler({
			"dry-run": "true",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			message?: string;
			data?: {
				lastUpstreamCommitSha?: string | null;
				alreadyMerged?: boolean;
			};
		};

		expect(parsed.ok).toBe(true);
		expect(parsed.data?.lastUpstreamCommitSha).toBeNull();

		expect(parsed.message).toBe(
			"No upstream commit recorded. Run upgrade with force to set it.",
		);
	});

	it("force upgrade calls RepositoryConnection and updates settings", async () => {
		const result = await handler({
			force: "true",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			message?: string;
			data?: { oid?: string; alreadyMerged?: boolean };
		};

		expect(RepositoryConnection).toHaveBeenCalledTimes(1);
		expect(mockUpgradeFromUpstream).toHaveBeenCalledTimes(1);
		expect(plugin.settings.lastUpstreamCommitSha).toBe("def456");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(parsed.ok).toBe(true);
		expect(parsed.message).toBe("Upgraded to def456.");

		expect(parsed.data).toEqual({
			alreadyMerged: false,
			oid: "def456",
		});
	});

	it("force upgrade reports already up to date", async () => {
		mockUpgradeFromUpstream.mockResolvedValue({
			alreadyMerged: true,
			oid: "abc123",
		});

		const result = await handler({
			force: "true",
			format: "json",
		} as CliData);

		const parsed = JSON.parse(result) as {
			ok: boolean;
			message?: string;
			data?: { oid?: string; alreadyMerged?: boolean };
		};

		expect(parsed.message).toBe("Already up to date.");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.settings.lastUpstreamCommitSha).toBe("abc123");
	});

	it("returns error when force is missing", async () => {
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Upgrade requires the 'force' flag.");
	});

	it("returns pre-flight validation error", async () => {
		(validatePreFlight as jest.Mock).mockReturnValue(
			"Git remote URL is not configured.",
		);

		const result = await handler({ force: "true" } as CliData);

		expect(result).toBe("Error: Git remote URL is not configured.");
		expect(RepositoryConnection).not.toHaveBeenCalled();
	});
});
