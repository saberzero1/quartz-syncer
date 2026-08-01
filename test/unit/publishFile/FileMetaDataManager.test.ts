import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { FileMetadataManager } from "src/publishFile/FileMetaDataManager";
import type QuartzSyncerSettings from "src/models/settings";

const baseSettings: QuartzSyncerSettings = {
	settingsSchemaVersion: 2,
	gitRemoteUrl: "",
	gitBranch: "v4",
	gitCorsProxyUrl: "",
	gitAuthType: "basic",
	gitAuthUsername: "",
	gitProviderHint: "github",
	vaultPath: "/",
	githubRepo: undefined,
	githubUserName: undefined,
	githubToken: undefined,
	contentFolder: "content",
	publishFrontmatterKey: "publish",
	allNotesPublishableByDefault: false,
	showCreatedTimestamp: true,
	showUpdatedTimestamp: true,
	showPublishedTimestamp: false,
	usePermalink: false,
	includeAllFrontmatter: false,
	frontmatterFormat: "yaml",
	createdTimestampKey: "created, created_at, date",
	updatedTimestampKey: "modified, lastmod, updated, last-modified",
	publishedTimestampKey: "published, publishDate, date",
	timestampFormat: "MMM dd, yyyy h:mm a",
	useCache: true,
	syncCache: true,
	persistCache: false,
	cacheTimestamp: 0,
	cache: "{}",
	useAutoCardLink: false,
	useDataview: true,
	useDatacore: false,
	useExcalidraw: false,
	useFantasyStatblocks: false,
	useBases: false,
	useCanvas: false,
	manageSyncerStyles: true,
	noteSettingsIsInitialized: false,
	lastUsedSettingsTab: "git",
	pluginVersion: "",
	lastUpstreamCommitSha: "",
	upgradeCheckStrategy: "version",
	diffViewStyle: "auto",
	autoPublishInterval: 0,
	remoteFetchInterval: 60,
	quartzRepoPath: "",
	enableSystemCommands: true,
	ENABLE_DEVELOPER_TOOLS: false,
};

function makeFile(mtime: number, ctime: number): TFile {
	const file = new TFile();
	file.stat = { mtime, ctime, size: 0 };
	return file;
}

describe("FileMetadataManager", () => {
	it("uses custom created timestamps when present", () => {
		const manager = new FileMetadataManager(
			makeFile(2000, 1000),
			{ created_at: "2024-01-01" },
			baseSettings,
		);

		expect(manager.getCreatedAt()).toBe("2024-01-01");
	});

	it("falls back to file timestamps when missing", () => {
		const manager = new FileMetadataManager(
			makeFile(2000, 1000),
			{},
			baseSettings,
		);

		expect(manager.getCreatedAt()).toBe(new Date(1000).toISOString());
		expect(manager.getUpdatedAt()).toBe(new Date(2000).toISOString());
		expect(manager.getPublishedAt()).toBe(new Date(2000).toISOString());
	});

	it("resolves updated and published keys in order", () => {
		const settings = {
			...baseSettings,
			updatedTimestampKey: "updated, lastmod",
			publishedTimestampKey: "published, publishDate",
		};
		const manager = new FileMetadataManager(
			makeFile(2000, 1000),
			{ lastmod: "2024-05-01", publishDate: "2024-06-01" },
			settings,
		);

		expect(manager.getUpdatedAt()).toBe("2024-05-01");
		expect(manager.getPublishedAt()).toBe("2024-06-01");
	});
});
