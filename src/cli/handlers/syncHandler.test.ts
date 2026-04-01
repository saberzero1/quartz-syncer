import QuartzSyncer from "main";
import { createSyncHandler } from "src/cli/handlers/syncHandler";
import { CliData, RegisterFn } from "src/cli/types";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

jest.mock("src/publisher/Publisher");
jest.mock("src/publisher/PublishStatusManager");
jest.mock("src/repositoryConnection/QuartzSyncerSiteManager");

describe("syncHandler", () => {
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

	const makeFile = (path: string) => ({ getPath: () => path });

	beforeEach(() => {
		jest.clearAllMocks();
		(QuartzSyncerSiteManager as jest.Mock).mockImplementation(() => ({}));
	});

	it("publishes without force and skips deletions", async () => {
		const publishBatch = jest.fn().mockResolvedValue(true);
		const deleteBatch = jest.fn();
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createSyncHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Published 1 file");
		expect(result).toContain("Skipped 1 deletion");
		expect(deleteBatch).not.toHaveBeenCalled();

		expect(publishBatch).toHaveBeenCalledWith(
			[expect.objectContaining({ getPath: expect.any(Function) })],
			"conn",
		);
	});

	it("publishes and deletes with force", async () => {
		const publishBatch = jest.fn().mockResolvedValue(true);
		const deleteBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createSyncHandler(register, createMockPlugin());
		const result = await handler({ force: "true" } as CliData);

		expect(result).toContain("Deleted 1 file");
		expect(deleteBatch).toHaveBeenCalledWith(["notes/deleted.md"], "conn");
	});

	it("includes file paths in verbose text mode", async () => {
		const publishBatch = jest.fn().mockResolvedValue(true);
		const deleteBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [makeFile("notes/changed.md")],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createSyncHandler(register, createMockPlugin());

		const result = await handler({
			force: "true",
			verbose: "true",
		} as CliData);

		expect(result).toContain("notes/new.md");
		expect(result).toContain("notes/changed.md");
		expect(result).toContain("notes/deleted.md");
	});

	it("returns dry-run preview without changes", async () => {
		const publishBatch = jest.fn();
		const deleteBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [makeFile("notes/changed.md")],
			publishedNotes: [],
			deletedNotePaths: [{ path: "notes/deleted.md" }],
			deletedBlobPaths: [{ path: "images/old.png" }],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createSyncHandler(register, createMockPlugin());
		const result = await handler({ "dry-run": "true" } as CliData);

		expect(result).toContain("Dry run: 2 to publish, 2 to delete.");
		expect(createConnection).not.toHaveBeenCalled();
		expect(publishBatch).not.toHaveBeenCalled();
		expect(deleteBatch).not.toHaveBeenCalled();
	});

	it("returns nothing to sync when no files", async () => {
		const publishBatch = jest.fn();
		const deleteBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
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

		createSyncHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Nothing to sync.");
		expect(createConnection).not.toHaveBeenCalled();
	});

	it("returns error when publishBatch fails", async () => {
		const publishBatch = jest.fn().mockResolvedValue(false);
		const deleteBatch = jest.fn();
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			deleteBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [],
			publishedNotes: [],
			deletedNotePaths: [],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createSyncHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Failed to publish files.");
	});
});
