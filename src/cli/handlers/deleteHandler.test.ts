import QuartzSyncer from "main";
import { createDeleteHandler } from "src/cli/handlers/deleteHandler";
import { CliData, RegisterFn } from "src/cli/types";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

jest.mock("src/publisher/Publisher");
jest.mock("src/publisher/PublishStatusManager");
jest.mock("src/repositoryConnection/QuartzSyncerSiteManager");

describe("deleteHandler", () => {
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
		(QuartzSyncerSiteManager as jest.Mock).mockImplementation(() => ({}));
	});

	it("requires force flag", async () => {
		const deleteBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createDeleteHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Deletion requires the 'force' flag.");
		expect(deleteBatch).not.toHaveBeenCalled();
	});

	it("deletes with force", async () => {
		const deleteBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createDeleteHandler(register, createMockPlugin());
		const result = await handler({ force: "true" } as CliData);

		expect(result).toContain("Deleted 1 file.");
		expect(deleteBatch).toHaveBeenCalledWith(["notes/deleted.md"], "conn");
	});

	it("includes file paths in verbose text mode", async () => {
		const deleteBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [{ path: "images/old.png" }],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createDeleteHandler(register, createMockPlugin());

		const result = await handler({
			force: "true",
			verbose: "true",
		} as CliData);

		expect(result).toContain("notes/deleted.md");
		expect(result).toContain("images/old.png");
	});

	it("returns dry-run output", async () => {
		const deleteBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [{ path: "images/old.png" }],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createDeleteHandler(register, createMockPlugin());
		const result = await handler({ "dry-run": "true" } as CliData);

		expect(result).toContain("Dry run: 2 to delete.");
		expect(createConnection).not.toHaveBeenCalled();
	});

	it("returns nothing to delete when empty", async () => {
		const deleteBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createDeleteHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Nothing to delete.");
		expect(createConnection).not.toHaveBeenCalled();
	});
});
