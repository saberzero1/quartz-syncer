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

describe("DEFAULT_SETTINGS completeness", () => {
	it("provides a default for every key in QuartzSyncerSettings", async () => {
		const plugin = createPlugin({});
		await plugin.loadSettings();

		const settings = plugin.settings;
		expect(settings.settingsSchemaVersion).toBeDefined();
		expect(settings.gitRemoteUrl).toBeDefined();
		expect(settings.gitBranch).toBeDefined();
		expect(settings.gitAuthType).toBeDefined();
		expect(settings.publishFrontmatterKey).toBeDefined();
		expect(settings.contentFolder).toBeDefined();
		expect(settings.useCache).toBeDefined();
		expect(settings.diffViewStyle).toBeDefined();
		expect(settings.createdTimestampKey).toBeDefined();
		expect(settings.updatedTimestampKey).toBeDefined();
		expect(settings.publishedTimestampKey).toBeDefined();
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
		expect(plugin.settings.settingsSchemaVersion).toBe(4);
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
		expect(plugin.settings.settingsSchemaVersion).toBe(4);
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
