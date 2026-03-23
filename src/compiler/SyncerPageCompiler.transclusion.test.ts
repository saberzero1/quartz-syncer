/**
 * Layer 2: createTranscludedText unit tests.
 *
 * Tests transclusion behavior with mocked PublishFile instances and metadata.
 * These behavioral contracts must hold during the remark-obsidian migration.
 */

const publishFileFixtures = {
	contents: new Map<string, string>(),
	metadata: new Map<string, Record<string, unknown>>(),
	blocks: new Map<
		string,
		Record<
			string,
			{ position: { start: { line: number }; end: { line: number } } }
		>
	>(),
};

jest.mock("src/publishFile/PublishFile", () => {
	class PublishFile {
		file: { path: string; name: string; extension: string };
		constructor(args: {
			file: { path: string; name: string; extension: string };
		}) {
			this.file = args.file;
		}
		getPath() {
			return this.file.path;
		}
		getVaultPath() {
			return this.file.path;
		}
		cachedRead() {
			return Promise.resolve(
				publishFileFixtures.contents.get(this.file.path) ?? "",
			);
		}
		getMetadata() {
			return publishFileFixtures.metadata.get(this.file.path);
		}
		getBlock(blockId: string) {
			const blocksForFile = publishFileFixtures.blocks.get(
				this.file.path,
			);
			return blocksForFile ? blocksForFile[blockId] : undefined;
		}
	}

	return { PublishFile };
});

import { SyncerPageCompiler } from "./SyncerPageCompiler";
import { App, MetadataCache, Vault } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { DataStore } from "src/publishFile/DataStore";

function makeSettings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return {
		vaultPath: "/",
		applyEmbeds: true,
		useExcalidraw: false,
		useDataview: false,
		usePermalink: false,
		includeAllFrontmatter: false,
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		showPublishedTimestamp: false,
		publishFrontmatterKey: "publish",
		allNotesPublishableByDefault: false,
		contentFolder: "content",
		useFullResolutionImages: false,
		pathRewriteRules: "",
		createdTimestampKey: "created",
		updatedTimestampKey: "updated",
		publishedTimestampKey: "published",
		timestampFormat: "YYYY-MM-DD",
		frontmatterFormat: "yaml",
		useCache: false,
		syncCache: false,
		persistCache: false,
		cacheTimestamp: 0,
		cache: "",
		useAutoCardLink: false,
		useDatacore: false,
		useFantasyStatblocks: false,
		useBases: false,
		useCanvas: false,
		useThemes: false,
		manageSyncerStyles: false,
		noteSettingsIsInitialized: false,
		lastUsedSettingsTab: "",
		pluginVersion: "0.0.0",
		diffViewStyle: "auto",
		git: {
			remoteUrl: "",
			branch: "main",
			auth: { type: "none" },
		},
		...overrides,
	} as QuartzSyncerSettings;
}

function makeCompiler(
	settingsOverrides: Partial<QuartzSyncerSettings> = {},
	metadataCache?: MetadataCache,
) {
	const app = new App();
	const vault = new Vault();
	const settings = makeSettings(settingsOverrides);
	const mc = metadataCache ?? new MetadataCache();
	const datastore = {} as DataStore;
	const getFilesMarkedForPublishing = jest.fn().mockResolvedValue({
		notes: [],
	});

	const compiler = new SyncerPageCompiler(
		app as any,
		vault as any,
		settings,
		mc as any,
		datastore,
		getFilesMarkedForPublishing,
	);

	return { compiler, metadataCache: mc, settings, app };
}

function makeLinkedFile(path: string) {
	const name = path.split("/").pop() ?? path;
	const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";
	return { path, name, extension };
}

describe("SyncerPageCompiler createTranscludedText", () => {
	beforeEach(() => {
		publishFileFixtures.contents.clear();
		publishFileFixtures.metadata.clear();
		publishFileFixtures.blocks.clear();
	});

	it("returns text unchanged when depth limit is reached", async () => {
		const { compiler } = makeCompiler();
		const file = { getPath: () => "notes/main.md" } as any;
		const input = "Before ![[note]] After";
		const result = await compiler.createTranscludedText(4)(file)(input);
		expect(result).toBe(input);
	});

	it("returns text unchanged when applyEmbeds is false", async () => {
		const { compiler } = makeCompiler({ applyEmbeds: false });
		const file = { getPath: () => "notes/main.md" } as any;
		const input = "Before ![[note]] After";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toBe(input);
	});

	it("inlines basic transcluded content and strips frontmatter", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/linked.md"),
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set(
			"notes/linked.md",
			"---\ntitle: Linked\n---\n\nLinked body",
		);

		const input = "Before ![[linked]] After";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("Linked body");
		expect(result).not.toContain("title: Linked");
	});

	it("transcludes block references and removes block id", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/linked.md"),
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set(
			"notes/linked.md",
			"Line 1\nBlock content ^block1\nLine 3",
		);
		publishFileFixtures.blocks.set("notes/linked.md", {
			block1: { position: { start: { line: 1 }, end: { line: 1 } } },
		});

		const input = "Start ![[linked#^block1]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("Block content ");
		expect(result).not.toContain("^block1");
	});

	it("transcludes header sections based on metadata headings", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/linked.md"),
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set(
			"notes/linked.md",
			"# One\nIntro\n## Two\nTarget section\n## Three\nNext section",
		);
		publishFileFixtures.metadata.set("notes/linked.md", {
			headings: [
				{ heading: "One", level: 1, position: { start: { line: 0 } } },
				{ heading: "Two", level: 2, position: { start: { line: 2 } } },
				{
					heading: "Three",
					level: 2,
					position: { start: { line: 4 } },
				},
			],
		});

		const input = "Start ![[linked#Two]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("## Two\nTarget section");
		expect(result).not.toContain("## Three");
	});

	it("recursively resolves nested transclusions", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockImplementation(
			(path: string) => {
				if (path === "parent") return makeLinkedFile("notes/parent.md");
				if (path === "child") return makeLinkedFile("notes/child.md");
				return null;
			},
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set(
			"notes/parent.md",
			"Parent content ![[child]]",
		);
		publishFileFixtures.contents.set("notes/child.md", "Child content");

		const input = "Start ![[parent]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("Parent content");
		expect(result).toContain("Child content");
	});

	it("skips excalidraw transclusions", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/diagram.excalidraw.md"),
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		const input = "Start ![[diagram]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toBe(input);
	});

	it("applies vault path filtering inside transcluded content", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/linked.md"),
		);
		const { compiler } = makeCompiler({ vaultPath: "vault/" }, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set(
			"notes/linked.md",
			"See [[vault/page]]",
		);

		const input = "Start ![[linked]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("[[page]]");
	});

	it("does not alter standalone block math lines", async () => {
		const mc = new MetadataCache();
		(mc.getFirstLinkpathDest as jest.Mock).mockReturnValue(
			makeLinkedFile("notes/linked.md"),
		);
		const { compiler } = makeCompiler({}, mc);
		const file = { getPath: () => "notes/main.md" } as any;

		publishFileFixtures.contents.set("notes/linked.md", "$$\n");

		const input = "Start ![[linked]] End";
		const result = await compiler.createTranscludedText(0)(file)(input);
		expect(result).toContain("$$");
	});
});
