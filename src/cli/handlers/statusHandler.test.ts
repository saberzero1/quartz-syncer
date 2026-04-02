import type QuartzSyncer from "main";
import { createStatusHandler } from "src/cli/handlers/statusHandler";
import { CliData, RegisterFn } from "src/cli/types";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

jest.mock("src/publisher/Publisher");
jest.mock("src/publisher/PublishStatusManager");
jest.mock("src/repositoryConnection/QuartzSyncerSiteManager");

describe("statusHandler", () => {
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
		(Publisher as jest.Mock).mockImplementation(() => ({}));
		(QuartzSyncerSiteManager as jest.Mock).mockImplementation(() => ({}));
	});

	it("returns formatted status in text mode", async () => {
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

		createStatusHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toContain("Unpublished: 1");
		expect(result).toContain("Changed:     1");
		expect(result).toContain("Published:   0");
		expect(result).toContain("Deleted:     2");
	});

	it("includes file paths in verbose text mode", async () => {
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

		createStatusHandler(register, createMockPlugin());
		const result = await handler({ verbose: "true" } as CliData);

		expect(result).toContain("notes/new.md");
		expect(result).toContain("notes/changed.md");
		expect(result).toContain("notes/deleted.md");
	});

	it("returns JSON when format=json", async () => {
		const mockGetPublishStatus = jest.fn().mockResolvedValue({
			unpublishedNotes: [makeFile("notes/new.md")],
			changedNotes: [],
			publishedNotes: [makeFile("notes/published.md")],
			deletedNotePaths: [{ path: "notes/old.md" }],
			deletedBlobPaths: [],
		});

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		createStatusHandler(register, createMockPlugin());
		const result = await handler({ format: "json" } as CliData);
		const parsed = JSON.parse(result);

		expect(parsed.ok).toBe(true);

		expect(parsed.data.summary).toEqual({
			unpublished: 1,
			changed: 0,
			published: 1,
			deletedNotes: 1,
			deletedBlobs: 0,
		});
	});

	it("returns error when pre-flight validation fails", async () => {
		const mockGetPublishStatus = jest.fn();

		(PublishStatusManager as jest.Mock).mockImplementation(() => ({
			getPublishStatus: mockGetPublishStatus,
		}));

		const plugin = createMockPlugin();
		plugin.settings.git.remoteUrl = "";
		createStatusHandler(register, plugin);
		const result = await handler({} as CliData);

		expect(result).toContain("Error: Git remote URL is not configured.");
		expect(mockGetPublishStatus).not.toHaveBeenCalled();
	});
});
