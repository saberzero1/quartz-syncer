import Publisher from "./Publisher";
import QuartzSyncer from "main";

import { TFile, Vault, MetadataCache, App } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { DataStore } from "src/publishFile/DataStore";

jest.mock("src/publishFile/PublishFile", () => {
	return {
		PublishFile: jest.fn(({ file }) => ({
			file,
			getBlobLinks: jest.fn().mockResolvedValue([]),
			compare: (other: TFile) => file.path.localeCompare(other.path),
		})),
	};
});

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
		} as unknown as Vault;

		const metadataCache = {
			getCache: jest.fn().mockReturnValue({ frontmatter: {} }),
		} as unknown as MetadataCache;

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
	});
});
