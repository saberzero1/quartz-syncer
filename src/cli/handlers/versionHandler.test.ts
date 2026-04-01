import type QuartzSyncer from "main";
import { createVersionHandler } from "src/cli/handlers/versionHandler";
import { CliData, RegisterFn } from "src/cli/types";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

jest.mock("obsidian", () => ({
	apiVersion: "1.12.7",
}));
jest.mock("src/repositoryConnection/RepositoryConnection");
jest.mock("src/quartz/QuartzVersionDetector");

describe("versionHandler", () => {
	let handler: (params: CliData) => Promise<string>;

	const register: RegisterFn = (_cmd, _desc, _flags, h) => {
		handler = h as (params: CliData) => Promise<string>;
	};

	const createMockPlugin = (
		overrides?: Partial<QuartzSyncer>,
	): QuartzSyncer =>
		({
			app: {
				metadataCache: {},
				vault: { getFileByPath: jest.fn(), getFiles: jest.fn() },
				fileManager: {},
				version: "1.12.7",
			},
			appVersion: "1.13.0",
			settings: {
				git: {
					remoteUrl: "https://github.com/test/repo.git",
					branch: "main",
				},
				publishFrontmatterKey: "publish",
				useCache: true,
				contentFolder: "content",
				vaultPath: "/",
			},
			getGitSettingsWithSecret: jest.fn().mockReturnValue({
				remoteUrl: "https://github.com/test/repo.git",
				branch: "main",
				auth: {},
				corsProxyUrl: "",
			}),
			datastore: {
				allFiles: jest.fn(),
				getLastUpdateTimestamp: jest.fn(),
				setLastUpdateTimestamp: jest.fn(),
				recreate: jest.fn(),
				persister: { removeItem: jest.fn() },
				fileKey: jest.fn((path: string) => `file:${path}`),
			},
			saveSettings: jest.fn(),
			...overrides,
		}) as unknown as QuartzSyncer;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns text output with version strings", async () => {
		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				getRepositoryName: jest.fn().mockReturnValue("test/repo"),
			}),
		);

		(
			QuartzVersionDetector.detectQuartzVersion as jest.Mock
		).mockResolvedValue("v5-yaml");

		(
			QuartzVersionDetector.getQuartzPackageVersion as jest.Mock
		).mockResolvedValue("5.0.0");

		createVersionHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Quartz Syncer: 1.13.0");
		expect(result).toContain("Obsidian: 1.12.7");
		expect(result).toContain("Quartz: 5.0.0 (v5-yaml)");
	});

	it("returns json output with version fields", async () => {
		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				getRepositoryName: jest.fn().mockReturnValue("test/repo"),
			}),
		);

		(
			QuartzVersionDetector.detectQuartzVersion as jest.Mock
		).mockResolvedValue("v5-json");

		(
			QuartzVersionDetector.getQuartzPackageVersion as jest.Mock
		).mockResolvedValue("5.1.0");

		createVersionHandler(register, createMockPlugin());
		const result = await handler({ format: "json" } as CliData);
		const parsed = JSON.parse(result);

		expect(parsed.ok).toBe(true);

		expect(parsed.data).toEqual({
			pluginVersion: "1.13.0",
			obsidianVersion: "1.12.7",
			quartzVersion: "5.1.0",
			quartzFormat: "v5-json",
		});
	});

	it("handles unknown Quartz version gracefully", async () => {
		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				getRepositoryName: jest.fn().mockReturnValue("test/repo"),
			}),
		);

		(
			QuartzVersionDetector.detectQuartzVersion as jest.Mock
		).mockResolvedValue("unknown");

		(
			QuartzVersionDetector.getQuartzPackageVersion as jest.Mock
		).mockResolvedValue(null);

		createVersionHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Quartz: unknown (unknown)");
	});

	it("returns validation error when git is not configured", async () => {
		const plugin = createMockPlugin();
		plugin.settings.git.remoteUrl = "";

		createVersionHandler(register, plugin);

		const result = await handler({} as CliData);

		expect(result).toContain("Error: Git remote URL is not configured.");
		expect(RepositoryConnection).not.toHaveBeenCalled();
	});
});
