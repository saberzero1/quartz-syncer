import { describe, expect, it, vi } from "vitest";
import { IntegrationRegistry } from "src/compiler/integrations/registry";
import type { PluginIntegration } from "src/compiler/integrations/types";
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
	useDataview: false,
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
	quartzRepoPath: "",
	enableSystemCommands: true,
	ENABLE_DEVELOPER_TOOLS: false,
};

const makeSettings = (
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings => ({
	...baseSettings,
	...overrides,
});

const makeIntegration = (
	overrides: Partial<PluginIntegration> = {},
): PluginIntegration => ({
	id: "integration",
	name: "Integration",
	settingKey: "useDataview",
	priority: 100,
	assets: {},
	category: "core",
	isAvailable: vi.fn().mockReturnValue(true),
	getPatterns: () => [],
	compile: vi.fn().mockResolvedValue(""),
	...overrides,
});

describe("IntegrationRegistry", () => {
	it("registers integrations successfully", () => {
		const registry = new IntegrationRegistry();
		const integration = makeIntegration({ id: "alpha" });

		registry.register(integration);

		expect(registry.getAll()).toEqual([integration]);
	});

	it("sorts by priority", () => {
		const registry = new IntegrationRegistry();
		const slow = makeIntegration({
			id: "slow",
			priority: 200,
			settingKey: "useDataview",
		});
		const fast = makeIntegration({
			id: "fast",
			priority: 50,
			settingKey: "useDatacore",
		});

		registry.register(slow);
		registry.register(fast);

		const enabled = registry.getEnabled(
			makeSettings({ useDataview: true, useDatacore: true }),
		);
		expect(enabled.map((integration) => integration.id)).toEqual([
			"fast",
			"slow",
		]);
	});

	it("filters by category (core vs community)", () => {
		const registry = new IntegrationRegistry();
		const core = makeIntegration({ id: "core", category: "core" });
		const community = makeIntegration({
			id: "community",
			category: "community",
		});

		registry.register(core);
		registry.register(community);

		expect(registry.getByCategory("core")).toEqual([core]);
		expect(registry.getByCategory("community")).toEqual([community]);
	});

	it("returns enabled integrations only", () => {
		const registry = new IntegrationRegistry();
		const enabled = makeIntegration({
			id: "enabled",
			settingKey: "useDataview",
		});
		const disabled = makeIntegration({
			id: "disabled",
			settingKey: "useDatacore",
		});
		const unavailable = makeIntegration({
			id: "unavailable",
			settingKey: "useExcalidraw",
			isAvailable: vi.fn().mockReturnValue(false),
		});

		registry.register(enabled);
		registry.register(disabled);
		registry.register(unavailable);

		const result = registry.getEnabled(
			makeSettings({
				useDataview: true,
				useDatacore: false,
				useExcalidraw: true,
			}),
		);

		expect(result).toEqual([enabled]);
	});

	it("getByCategory works correctly", () => {
		const registry = new IntegrationRegistry();

		expect(registry.getByCategory("community")).toEqual([]);
	});
});
