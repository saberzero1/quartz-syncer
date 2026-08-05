import { beforeEach, describe, expect, it, vi } from "vitest";
import type QuartzSyncer from "src/main";
import type { GitBackend } from "src/git/types";
import type { CliParams } from "src/cli/types";
import type { DataStore } from "src/cache/DataStore";
import { createCacheHandler } from "src/cli/handlers/cacheHandler";
import { createConfigHandler } from "src/cli/handlers/configHandler";
import { createUpgradeHandler } from "src/cli/handlers/upgradeHandler";
import { createVersionHandler } from "src/cli/handlers/versionHandler";
import { createPluginHandler } from "src/cli/handlers/pluginHandler";
import { createQuartzConfigHandler } from "src/cli/handlers/quartzConfigHandler";

const { createGitBackend, setBackend } = vi.hoisted(() => {
	let backend: GitBackend | null = null;
	return {
		createGitBackend: vi.fn(() => {
			if (!backend) {
				throw new Error("Backend not set");
			}
			return backend;
		}),
		setBackend: (nextBackend: GitBackend) => {
			backend = nextBackend;
		},
	};
});

vi.mock("src/git/GitBackendFactory", () => ({
	createGitBackend,
}));

const makeBackend = (files: Record<string, string>): GitBackend => {
	const entries = Object.keys(files).map((path) => ({
		path,
		type: "blob" as const,
		sha: path,
	}));
	const encoder = new TextEncoder();
	return {
		readTree: vi.fn(async () => entries),
		readBlob: vi.fn(async (sha: string) =>
			encoder.encode(files[sha] ?? ""),
		),
		writeFiles: vi.fn(async (_branch, _message, changes) => {
			for (const change of changes) {
				files[change.path] = change.content;
			}
		}),
	} as unknown as GitBackend;
};

const buildParams = (args: Record<string, string> = {}): CliParams => ({
	args,
	flags: new Set(),
	verbose: false,
});

const buildPlugin = (overrides: Partial<QuartzSyncer> = {}): QuartzSyncer => {
	const plugin = {
		settings: {
			gitRemoteUrl: "https://example.com/repo.git",
			gitBranch: "main",
			gitCorsProxyUrl: "",
			gitAuthType: "none",
			gitAuthUsername: "",
			gitProviderHint: "github",
		},
		getGitSettingsWithSecret: vi.fn(() => ({
			remoteUrl: "https://example.com/repo.git",
			branch: "main",
			corsProxyUrl: undefined,
			auth: { type: "none" },
			providerHint: "github",
		})),
		app: { version: "1.6.0" },
		manifest: { version: "9.9.9" },
		saveSettings: vi.fn(),
	} as unknown as QuartzSyncer;

	return Object.assign(plugin, overrides);
};

describe("CLI handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("cacheHandler returns status and clears cache", async () => {
		const persister = {
			iterate: vi.fn(
				async (callback: (value: unknown, key: string) => void) => {
					callback({ foo: "bar" }, "file:notes/test.md");
				},
			),
		};
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => ["notes/test.md"]),
			persister,
		} as unknown as DataStore;

		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const status = await handler(buildParams({ action: "status" }));
		const statusData = status.data as {
			entries: number;
			sizeEstimateBytes: number;
		};
		expect(status.success).toBe(true);
		expect(statusData.entries).toBe(1);
		expect(statusData.sizeEstimateBytes).toBeGreaterThan(0);

		const clear = await handler(buildParams({ action: "clear" }));
		expect(clear.success).toBe(true);
		expect(dataStore.dropAllFiles).toHaveBeenCalledTimes(1);
	});

	it("configHandler gets and sets settings", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const getResult = await handler(
			buildParams({ action: "get", key: "gitBranch" }),
		);
		expect(getResult.success).toBe(true);
		expect(getResult.data).toEqual({ key: "gitBranch", value: "main" });

		const setResult = await handler(
			buildParams({ action: "set", key: "gitBranch", value: "dev" }),
		);
		expect(setResult.success).toBe(true);
		expect(plugin.settings.gitBranch).toBe("dev");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("upgradeHandler returns error when repo path not configured", async () => {
		const plugin = buildPlugin();
		const handler = createUpgradeHandler(plugin);

		const result = await handler(buildParams());
		expect(result.success).toBe(false);
		expect(result.error).toContain(
			"No local Quartz repository path configured",
		);
	});

	it("versionHandler returns version info", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
			"package.json": JSON.stringify({ version: "5.1.0" }),
		};
		const backend = makeBackend(files);
		setBackend(backend);

		const plugin = buildPlugin();
		const handler = createVersionHandler(plugin);
		const result = await handler(buildParams());

		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			pluginVersion: "9.9.9",
			obsidianVersion: "1.6.0",
			quartzVersion: "v5-json",
			quartzPackageVersion: "5.1.0",
		});
	});

	it("pluginHandler lists installed plugins", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [
					{
						source: "github:test/repo",
						enabled: true,
						order: 50,
						options: {},
					},
				],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);

		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);
		const result = await handler(buildParams({ action: "list" }));
		expect(result.success).toBe(true);
		expect(result.data).toEqual([
			{
				source: "github:test/repo",
				enabled: true,
				order: 50,
				options: {},
			},
		]);
	});

	it("quartzConfigHandler gets and sets config", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);

		const plugin = buildPlugin();
		const handler = createQuartzConfigHandler(plugin);
		const getResult = await handler(
			buildParams({ action: "get", key: "configuration.pageTitle" }),
		);
		expect(getResult.success).toBe(true);
		expect(getResult.data).toEqual({
			key: "configuration.pageTitle",
			value: "Test",
		});

		const setResult = await handler(
			buildParams({
				action: "set",
				key: "configuration.pageTitle",
				value: "Updated",
			}),
		);
		expect(setResult.success).toBe(true);
		const writeFiles = backend.writeFiles as ReturnType<typeof vi.fn>;
		expect(writeFiles).toHaveBeenCalledTimes(1);
	});
});
