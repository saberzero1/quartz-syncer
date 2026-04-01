import QuartzSyncer from "main";
import { createTestHandler } from "src/cli/handlers/testHandler";
import { CliData, RegisterFn } from "src/cli/types";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

jest.mock("src/repositoryConnection/RepositoryConnection");

describe("testHandler", () => {
	let handler: (params: CliData) => Promise<string>;

	const register: RegisterFn = (_cmd, _desc, _flags, h) => {
		handler = h as (params: CliData) => Promise<string>;
	};

	const createMockPlugin = (): QuartzSyncer =>
		({
			app: {
				metadataCache: {},
				vault: { getFileByPath: jest.fn(), getFiles: jest.fn() },
				fileManager: {},
			},
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
		}) as unknown as QuartzSyncer;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("succeeds with read + write access", async () => {
		const testConnection = jest.fn().mockResolvedValue(true);
		const getRepositoryName = jest.fn().mockReturnValue("test/repo");

		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				testConnection,
				getRepositoryName,
			}),
		);

		(RepositoryConnection.checkWriteAccess as jest.Mock).mockResolvedValue(
			true,
		);

		createTestHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Connection OK (read: yes, write: yes).");

		expect(RepositoryConnection.checkWriteAccess).toHaveBeenCalledWith(
			"https://github.com/test/repo.git",
			{},
			"",
		);
	});

	it("includes repository details in verbose text mode", async () => {
		const testConnection = jest.fn().mockResolvedValue(true);
		const getRepositoryName = jest.fn().mockReturnValue("test/repo");

		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				testConnection,
				getRepositoryName,
			}),
		);

		(RepositoryConnection.checkWriteAccess as jest.Mock).mockResolvedValue(
			true,
		);

		createTestHandler(register, createMockPlugin());
		const result = await handler({ verbose: "true" } as CliData);

		expect(result).toContain("Repository: test/repo");
		expect(result).toContain("Branch: main");
	});

	it("succeeds with read-only access", async () => {
		const testConnection = jest.fn().mockResolvedValue(true);
		const getRepositoryName = jest.fn().mockReturnValue("test/repo");

		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				testConnection,
				getRepositoryName,
			}),
		);

		(RepositoryConnection.checkWriteAccess as jest.Mock).mockResolvedValue(
			false,
		);

		createTestHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Connection OK (read: yes, write: no).");
	});

	it("returns error when connection fails", async () => {
		const testConnection = jest.fn().mockResolvedValue(false);
		const getRepositoryName = jest.fn().mockReturnValue("test/repo");

		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({
				testConnection,
				getRepositoryName,
			}),
		);

		(RepositoryConnection.checkWriteAccess as jest.Mock).mockResolvedValue(
			true,
		);

		createTestHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Connection failed.");
		expect(RepositoryConnection.checkWriteAccess).not.toHaveBeenCalled();
	});
});
