import QuartzSyncer from "main";
import { createPublishHandler } from "src/cli/handlers/publishHandler";
import { CliData, RegisterFn } from "src/cli/types";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

jest.mock("src/publisher/Publisher");
jest.mock("src/publisher/PublishStatusManager");
jest.mock("src/repositoryConnection/QuartzSyncerSiteManager");

describe("publishHandler", () => {
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

	it("publishes all pending files", async () => {
		const publishBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [makeFile("notes/changed.md")],
			publishedNotes: [],
			deletedNotePaths: [],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createPublishHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Published 2 files.");

		expect(publishBatch).toHaveBeenCalledWith(
			[
				expect.objectContaining({ getPath: expect.any(Function) }),
				expect.any(Object),
			],
			"conn",
		);
	});

	it("includes file paths in verbose text mode", async () => {
		const publishBatch = jest.fn().mockResolvedValue(true);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
			createConnection,
		}));

		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [makeFile("notes/changed.md")],
			publishedNotes: [],
			deletedNotePaths: [],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createPublishHandler(register, createMockPlugin());
		const result = await handler({ verbose: "true" } as CliData);

		expect(result).toContain("notes/new.md");
		expect(result).toContain("notes/changed.md");
	});

	it("returns dry-run mode output", async () => {
		const publishBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
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

		createPublishHandler(register, createMockPlugin());
		const result = await handler({ "dry-run": "true" } as CliData);

		expect(result).toContain("Dry run: 1 to publish.");
		expect(createConnection).not.toHaveBeenCalled();
		expect(publishBatch).not.toHaveBeenCalled();
	});

	it("returns nothing to publish when empty", async () => {
		const publishBatch = jest.fn();
		const createConnection = jest.fn();

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
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

		createPublishHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Nothing to publish.");
		expect(createConnection).not.toHaveBeenCalled();
	});

	it("propagates publish errors", async () => {
		const publishBatch = jest.fn().mockResolvedValue(false);
		const createConnection = jest.fn().mockReturnValue("conn");

		(Publisher as jest.Mock).mockImplementation(() => ({
			publishBatch,
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

		createPublishHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Failed to publish files.");
	});
});
