import { readFileSync } from "fs";
import { resolve } from "path";
import type { App, PluginManifest } from "obsidian";
import QuartzSyncer from "src/main";
import { SecretStorageService } from "src/utils/SecretStorageService";

function loadFixture(name: string): Record<string, unknown> {
	const raw = readFileSync(
		resolve(__dirname, `../fixtures/settings/${name}.json`),
		"utf-8",
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

function createPlugin(savedData: Record<string, unknown>): QuartzSyncer {
	const plugin = new QuartzSyncer(
		{} as App,
		{} as PluginManifest,
	) as QuartzSyncer;
	plugin.loadData = vi.fn().mockResolvedValue(savedData);
	plugin.saveData = vi.fn().mockResolvedValue(undefined);
	return plugin;
}

describe("publishTarget migration to schema v5", () => {
	it("derives local for an existing local-repo user", async () => {
		const plugin = createPlugin({ quartzRepoPath: "/home/user/quartz" });
		await plugin.loadSettings();

		expect(plugin.settings.publishTarget).toBe("local");
	});

	it("derives remote when no local path was configured", async () => {
		const plugin = createPlugin({
			gitRemoteUrl: "https://github.com/user/repo.git",
		});
		await plugin.loadSettings();

		expect(plugin.settings.publishTarget).toBe("remote");
	});

	it("preserves an explicitly persisted choice", async () => {
		const plugin = createPlugin({
			quartzRepoPath: "/home/user/quartz",
			gitRemoteUrl: "https://github.com/user/repo.git",
			publishTarget: "remote",
		});
		await plugin.loadSettings();

		expect(plugin.settings.publishTarget).toBe("remote");
	});

	it("re-derives an unrecognized persisted value", async () => {
		const plugin = createPlugin({
			quartzRepoPath: "/home/user/quartz",
			publishTarget: "sideways",
		});
		await plugin.loadSettings();

		expect(plugin.settings.publishTarget).toBe("local");
	});

	it("still derives when the record already claims schema 5", async () => {
		const plugin = createPlugin({
			settingsSchemaVersion: 5,
			quartzRepoPath: "/home/user/quartz",
		});
		await plugin.loadSettings();

		expect(plugin.settings.publishTarget).toBe("local");
	});

	it("never clears the local path it migrated from", async () => {
		const plugin = createPlugin({ quartzRepoPath: "/home/user/quartz" });
		await plugin.loadSettings();

		expect(plugin.settings.quartzRepoPath).toBe("/home/user/quartz");
	});
});

describe("DEFAULT_SETTINGS completeness", () => {
	it("provides a default for every key in QuartzSyncerSettings", async () => {
		const plugin = createPlugin({});
		await plugin.loadSettings();

		const settings = plugin.settings;
		expect(settings.settingsSchemaVersion).toBe(5);
		expect(settings.publishTarget).toBe("remote");
		expect(settings.gitRemoteUrl).toBe("");
		expect(settings.gitBranch).toBe("v5");
		expect(settings.gitAuthType).toBe("basic");
		expect(settings.publishFrontmatterKey).toBe("publish");
		expect(settings.contentFolder).toBe("content");
		expect(settings.useCache).toBe(true);
		expect(settings.allNotesPublishableByDefault).toBe(false);
		expect(typeof settings.diffViewStyle).toBe("string");
		expect(typeof settings.createdTimestampKey).toBe("string");
		expect(typeof settings.updatedTimestampKey).toBe("string");
		expect(typeof settings.publishedTimestampKey).toBe("string");
	});

	it("keeps every current settings key backed by a default", async () => {
		// Cleared by the v0 migration, and pluginVersion is derived from the
		// manifest at load time rather than from DEFAULT_SETTINGS.
		const notDefaulted = new Set([
			"githubRepo",
			"githubUserName",
			"githubToken",
			"pluginVersion",
		]);

		const plugin = createPlugin({});
		await plugin.loadSettings();

		const missing = Object.entries(plugin.settings)
			.filter(
				([key, value]) => value === undefined && !notDefaulted.has(key),
			)
			.map(([key]) => key);

		expect(missing).toEqual([]);
	});
});

describe("settings migration", () => {
	it("migrates schema v0 (GitHub fields) to flat git keys", async () => {
		const fixture = loadFixture("schema-v0");
		const plugin = createPlugin(fixture);
		await plugin.loadSettings();

		expect(plugin.settings.gitRemoteUrl).toBe(
			"https://github.com/testuser/quartz.git",
		);
		expect(plugin.settings.gitAuthUsername).toBe("testuser");
		expect(plugin.settings.gitBranch).toBe("v4");
		expect(plugin.settings.gitProviderHint).toBe("github");
		const legacy = plugin.settings as unknown as Record<string, unknown>;
		expect(legacy["githubRepo"]).toBeUndefined();
		expect(legacy["githubUserName"]).toBeUndefined();
		expect(legacy["githubToken"]).toBeUndefined();
	});

	it("migrates schema v1 (nested git object) to flat keys", async () => {
		const fixture = loadFixture("schema-v1");
		const plugin = createPlugin(fixture);
		await plugin.loadSettings();

		expect(plugin.settings.gitRemoteUrl).toBe(
			"https://github.com/testuser/quartz.git",
		);
		expect(plugin.settings.gitBranch).toBe("v4");
		expect(plugin.settings.gitAuthType).toBe("basic");
		expect(plugin.settings.gitAuthUsername).toBe("testuser");
		expect(plugin.settings.settingsSchemaVersion).toBe(5);
		expect(
			(plugin.settings as unknown as Record<string, unknown>)["git"],
		).toBeUndefined();
	});

	it("passes schema v2 through unchanged", async () => {
		const fixture = loadFixture("schema-v2");
		const plugin = createPlugin(fixture);
		await plugin.loadSettings();

		expect(plugin.settings.gitRemoteUrl).toBe(
			"https://github.com/testuser/quartz.git",
		);
		expect(plugin.settings.gitBranch).toBe("v4");
		expect(plugin.settings.settingsSchemaVersion).toBe(5);
	});

	it("migrates empty timestamp keys to defaults", async () => {
		const plugin = createPlugin({
			createdTimestampKey: "",
			updatedTimestampKey: "",
			publishedTimestampKey: "",
		});
		await plugin.loadSettings();

		expect(plugin.settings.createdTimestampKey).toBe(
			"created, created_at, date",
		);
		expect(plugin.settings.updatedTimestampKey).toBe(
			"modified, lastmod, updated, last-modified",
		);
		expect(plugin.settings.publishedTimestampKey).toBe(
			"published, publishDate, date",
		);
	});

	it("removes legacy useThemes key", async () => {
		const plugin = createPlugin({
			useThemes: true,
			lastUsedSettingsTab: "themes",
		});
		await plugin.loadSettings();

		expect(
			(plugin.settings as unknown as Record<string, unknown>)[
				"useThemes"
			],
		).toBeUndefined();
		expect(plugin.settings.lastUsedSettingsTab).toBe("git");
	});
});

describe("SecretStorageService", () => {
	it("stores and retrieves tokens", () => {
		const mockStorage = {
			getSecret: vi.fn().mockReturnValue(null),
			setSecret: vi.fn(),
			listSecrets: vi.fn().mockReturnValue([]),
		};

		const service = new SecretStorageService({
			secretStorage: mockStorage,
		} as unknown as App);

		expect(service.hasToken()).toBe(false);

		service.setToken("test-token");
		expect(mockStorage.setSecret).toHaveBeenCalledWith(
			"quartz-syncer-git-token",
			"test-token",
		);

		expect(service.hasToken()).toBe(true);
		expect(service.getToken()).toBe("test-token");

		service.clearToken();
		expect(service.hasToken()).toBe(false);
	});
});
