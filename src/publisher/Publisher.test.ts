import Publisher from "./Publisher";
import QuartzSyncer from "main";

import { TFile, Vault, MetadataCache, App } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { DataStore } from "src/publishFile/DataStore";
import { ExtendedCacheService } from "src/services/ExtendedCacheService";

jest.mock("src/publishFile/PublishFile", () => {
	return {
		PublishFile: jest.fn(({ file }) => ({
			file,
			getBlobLinks: jest.fn().mockResolvedValue([]),
			compare: (other: TFile) => file.path.localeCompare(other.path),
		})),
	};
});

jest.mock("obsidian-extended-metadatacache");

function createMockExtendedCache(
	overrides: Partial<{ isReady: boolean }> = {},
): ExtendedCacheService {
	const { getAPI } = jest.requireMock("obsidian-extended-metadatacache");
	const handle = getAPI();

	const service = {
		get api() {
			return handle.api;
		},
		get isReady() {
			return overrides.isReady ?? true;
		},
		waitForReady: jest.fn().mockResolvedValue(undefined),
		destroy: jest.fn(),
	} as unknown as ExtendedCacheService;

	return service;
}

describe("Publisher", () => {
	describe("getFilesMarkedForPublishing", () => {
		let publisher: Publisher;

		const vaultFiles = Object.freeze([
			"note1.md",
			"note2.md",
			"folder/note3.md",
			"folder/note4.md",
			"vault-folder/note5.md",
			"vault-folder/note6.md",
			"outside-folder/note7.md",
			"outside-folder/note8.md",
			"vault-folder/sub/note9.md",
			"vault-folder/sub/note10.md",
			"outside-folder/sub/note11.md",
			"outside-folder/sub/note12.md",
		]);

		const vault = {
			getMarkdownFiles: jest
				.fn()
				.mockReturnValue(vaultFiles.map((path) => ({ path }) as TFile)),
			getFiles: jest.fn().mockReturnValue([]),
			getFileByPath: jest
				.fn()
				.mockImplementation(
					(path: string) => ({ path }) as TFile | null,
				),
		} as unknown as Vault;

		const metadataCache = {
			getCache: jest.fn().mockReturnValue({ frontmatter: {} }),
		} as unknown as MetadataCache;

		beforeEach(() => {
			jest.clearAllMocks();
			(vault.getMarkdownFiles as jest.Mock).mockReturnValue(
				vaultFiles.map((path) => ({ path }) as TFile),
			);
			(vault.getFiles as jest.Mock).mockReturnValue([]);
			(vault.getFileByPath as jest.Mock).mockImplementation(
				(path: string) => ({ path }) as TFile | null,
			);
			(metadataCache.getCache as jest.Mock).mockReturnValue({
				frontmatter: {},
			});
		});

		it("includes all markdown files when vaultPath is '/'", async () => {
			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "/",
					allNotesPublishableByDefault: true,
				} as QuartzSyncerSettings,
				{} as DataStore,
				createMockExtendedCache(),
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(result.notes.length).toBe(12);

			expect(
				new Set(result.notes.map((pFile) => pFile.file.path)),
			).toEqual(new Set(vaultFiles));
		});

		it("includes only files inside vaultPath when vaultPath is not '/'", async () => {
			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "vault-folder/",
					allNotesPublishableByDefault: true,
				} as QuartzSyncerSettings,
				{} as DataStore,
				createMockExtendedCache(),
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(result.notes.length).toBe(4);

			expect(
				new Set(result.notes.map((pFile) => pFile.file.path)),
			).toEqual(
				new Set([
					"vault-folder/note5.md",
					"vault-folder/note6.md",
					"vault-folder/sub/note9.md",
					"vault-folder/sub/note10.md",
				]),
			);
		});

		it("uses inverse cache when ready and allNotesPublishableByDefault is false", async () => {
			const extendedCache = createMockExtendedCache({ isReady: true });

			(
				extendedCache.api.getFilesWithFrontmatterKey as jest.Mock
			).mockReturnValue(new Set(["note1.md", "folder/note3.md"]));
			(metadataCache.getCache as jest.Mock).mockReturnValue({
				frontmatter: { publish: true },
			});

			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "/",
					allNotesPublishableByDefault: false,
					publishFrontmatterKey: "publish",
					useExcalidraw: false,
					useBases: false,
					useCanvas: false,
				} as QuartzSyncerSettings,
				{} as DataStore,
				extendedCache,
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(result.notes.length).toBe(2);
			expect(
				extendedCache.api.getFilesWithFrontmatterKey,
			).toHaveBeenCalledWith("publish");
			expect(vault.getMarkdownFiles).not.toHaveBeenCalled();
		});

		it("falls back to O(n) scan when cache not ready", async () => {
			const extendedCache = createMockExtendedCache({ isReady: false });

			(metadataCache.getCache as jest.Mock).mockReturnValue({
				frontmatter: { publish: true },
			});

			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "/",
					allNotesPublishableByDefault: false,
					publishFrontmatterKey: "publish",
					useExcalidraw: false,
					useBases: false,
					useCanvas: false,
				} as QuartzSyncerSettings,
				{} as DataStore,
				extendedCache,
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(vault.getMarkdownFiles).toHaveBeenCalled();
			expect(result.notes.length).toBe(12);
		});

		it("filters out files where publish key is falsy", async () => {
			const extendedCache = createMockExtendedCache({ isReady: true });

			(
				extendedCache.api.getFilesWithFrontmatterKey as jest.Mock
			).mockReturnValue(new Set(["note1.md", "note2.md"]));
			(metadataCache.getCache as jest.Mock).mockImplementation(
				(path: string) => ({
					frontmatter: {
						publish: path === "note1.md" ? true : false,
					},
				}),
			);

			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "/",
					allNotesPublishableByDefault: false,
					publishFrontmatterKey: "publish",
					useExcalidraw: false,
					useBases: false,
					useCanvas: false,
				} as QuartzSyncerSettings,
				{} as DataStore,
				extendedCache,
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(result.notes.length).toBe(1);
			expect(result.notes[0].file.path).toBe("note1.md");
		});

		it("respects vaultPath filter on cache results", async () => {
			const extendedCache = createMockExtendedCache({ isReady: true });

			(
				extendedCache.api.getFilesWithFrontmatterKey as jest.Mock
			).mockReturnValue(
				new Set(["vault-folder/note5.md", "outside-folder/note7.md"]),
			);
			(metadataCache.getCache as jest.Mock).mockReturnValue({
				frontmatter: { publish: true },
			});

			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "vault-folder/",
					allNotesPublishableByDefault: false,
					publishFrontmatterKey: "publish",
					useExcalidraw: false,
					useBases: false,
					useCanvas: false,
				} as QuartzSyncerSettings,
				{} as DataStore,
				extendedCache,
			);
			const result = await publisher.getFilesMarkedForPublishing();

			expect(result.notes.length).toBe(1);
			expect(result.notes[0].file.path).toBe("vault-folder/note5.md");
		});

		it("bypasses cache when allNotesPublishableByDefault is true", async () => {
			const extendedCache = createMockExtendedCache({ isReady: true });

			publisher = new Publisher(
				{} as App,
				{} as QuartzSyncer,
				vault,
				metadataCache,
				{
					vaultPath: "/",
					allNotesPublishableByDefault: true,
				} as QuartzSyncerSettings,
				{} as DataStore,
				extendedCache,
			);
			await publisher.getFilesMarkedForPublishing();

			expect(
				extendedCache.api.getFilesWithFrontmatterKey,
			).not.toHaveBeenCalled();
		});
	});
});
