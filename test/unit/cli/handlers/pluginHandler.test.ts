import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createPluginHandler } from "src/cli/handlers/pluginHandler";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";
import { buildParams, buildPlugin, makeBackend } from "./helpers";

const { getPlugins } = vi.hoisted(() => ({
	getPlugins: vi.fn(),
}));

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

vi.mock("src/quartz/QuartzPluginRegistry", () => ({
	QuartzPluginRegistry: class {
		getPlugins = getPlugins;
	},
}));

describe("pluginHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists installed plugins", async () => {
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
		expect(result).toEqual({
			success: true,
			data: [
				{
					source: "github:test/repo",
					enabled: true,
					order: 50,
					options: {},
				},
			],
		});
	});

	it("adds a plugin from a source string", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(
			buildParams({ action: "add", source: "github:test/repo" }),
		);
		expect(result).toEqual({
			success: true,
			data: {
				source: "github:test/repo",
				enabled: true,
				order: 50,
				options: {},
			},
		});
		const writeFiles = backend.writeFiles as ReturnType<typeof vi.fn>;
		expect(writeFiles).toHaveBeenCalledTimes(1);
	});

	it("removes a plugin by source key", async () => {
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

		const result = await handler(
			buildParams({ action: "remove", name: "github:test/repo" }),
		);
		expect(result).toEqual({
			success: true,
			data: {
				source: "github:test/repo",
				enabled: true,
				order: 50,
				options: {},
			},
		});
		const writeFiles = backend.writeFiles as ReturnType<typeof vi.fn>;
		expect(writeFiles).toHaveBeenCalledTimes(1);
	});

	it("returns a dry-run add without writing config", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(
			buildParams({ action: "add", source: "github:test/repo" }, [
				"dry-run",
			]),
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			dryRun: true,
			source: "github:test/repo",
		});
		expect(backend.writeFiles).not.toHaveBeenCalled();
		expect(files["quartz.plugins.json"]).toBe(
			JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		);
	});

	it("returns a dry-run removal without writing config", async () => {
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

		const result = await handler(
			buildParams({ action: "remove", name: "github:test/repo" }, [
				"dry-run",
			]),
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			dryRun: true,
			source: "github:test/repo",
		});
		expect(backend.writeFiles).not.toHaveBeenCalled();
		expect(files["quartz.plugins.json"]).toBe(
			JSON.stringify({
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
		);
	});

	it("returns all plugins when search has no query", async () => {
		getPlugins.mockResolvedValue([
			{
				name: "graph",
				displayName: "Graph",
				description: "Graph view",
				keywords: ["graph"],
				category: "visual",
			},
			{
				name: "foo",
				displayName: "Foo",
				description: "Something else",
				keywords: [],
				category: "other",
			},
		]);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(buildParams({ action: "search" }));
		expect(result).toEqual({
			success: true,
			data: {
				count: 2,
				plugins: [
					{
						name: "graph",
						displayName: "Graph",
						description: "Graph view",
						keywords: ["graph"],
						category: "visual",
					},
					{
						name: "foo",
						displayName: "Foo",
						description: "Something else",
						keywords: [],
						category: "other",
					},
				],
			},
		});
	});

	it("filters registry results by query", async () => {
		getPlugins.mockResolvedValue([
			{
				name: "graph",
				displayName: "Graph",
				description: "Graph view",
				keywords: ["graph"],
				category: "visual",
			},
			{
				name: "toc",
				displayName: "Table of contents",
				description: "Navigation",
				keywords: ["nav"],
				category: "structure",
			},
		]);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(
			buildParams({ action: "search", query: "graph" }),
		);
		expect(result.success).toBe(true);
		const data = result.data as { count: number; plugins: unknown[] };
		expect(data.count).toBe(1);
		expect(data.plugins).toEqual([
			{
				name: "graph",
				displayName: "Graph",
				description: "Graph view",
				keywords: ["graph"],
				category: "visual",
			},
		]);
	});

	it("returns empty results for unmatched queries", async () => {
		getPlugins.mockResolvedValue([
			{
				name: "graph",
				displayName: "Graph",
				description: "Graph view",
				keywords: ["graph"],
				category: "visual",
			},
		]);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(
			buildParams({ action: "search", query: "nonexistent" }),
		);
		expect(result).toEqual({
			success: true,
			data: {
				query: "nonexistent",
				count: 0,
				plugins: [],
			},
		});
	});

	it("returns empty results when registry fetch fails", async () => {
		getPlugins.mockResolvedValue([]);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(buildParams({ action: "search" }));
		expect(result).toEqual({
			success: true,
			data: {
				count: 0,
				plugins: [],
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "",
			},
		});
		const handler = createPluginHandler(plugin);

		const result = await handler(buildParams({ action: "list" }));
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("returns errors for missing parameters", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const missingSource = await handler(buildParams({ action: "add" }));
		expect(missingSource).toEqual({
			success: false,
			error: "Missing source parameter",
		});

		const missingName = await handler(buildParams({ action: "remove" }));
		expect(missingName).toEqual({
			success: false,
			error: "Missing name parameter",
		});
	});

	it("returns an error for unknown actions", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createPluginHandler(plugin);

		const result = await handler(buildParams({ action: "sync" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: sync",
		});
	});

	describe("plugin actions with QuartzRunner", () => {
		const buildRunnerPlugin = (runnerOverrides?: Partial<QuartzRunner>) => {
			const mockQuartzRunner = {
				pluginInstall: vi
					.fn()
					.mockResolvedValue({ ok: true, data: {} }),
				pluginEnable: vi.fn().mockResolvedValue({ ok: true, data: {} }),
				pluginDisable: vi
					.fn()
					.mockResolvedValue({ ok: true, data: {} }),
				pluginConfig: vi.fn().mockResolvedValue({ ok: true, data: {} }),
				pluginPrune: vi.fn().mockResolvedValue({ ok: true, data: {} }),
				...runnerOverrides,
			};
			return {
				plugin: buildPlugin({
					quartzRunner: mockQuartzRunner as QuartzRunner,
					settings: {
						...buildPlugin().settings,
						enableSystemCommands: true,
						quartzRepoPath: "/repo",
					},
				}),
				mockQuartzRunner,
			};
		};

		it("install calls pluginInstall with cwd", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "install" }));

			expect(mockQuartzRunner.pluginInstall).toHaveBeenCalledWith({
				cwd: "/repo",
				fromConfig: false,
				latest: false,
				clean: false,
				dryRun: false,
			});
		});

		it("install passes from-config flag", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "install" }, ["from-config"]));

			expect(mockQuartzRunner.pluginInstall).toHaveBeenCalledWith({
				cwd: "/repo",
				fromConfig: true,
				latest: false,
				clean: false,
				dryRun: false,
			});
		});

		it("install passes latest flag", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "install" }, ["latest"]));

			expect(mockQuartzRunner.pluginInstall).toHaveBeenCalledWith({
				cwd: "/repo",
				fromConfig: false,
				latest: true,
				clean: false,
				dryRun: false,
			});
		});

		it("install passes clean and dry-run flags", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(
				buildParams({ action: "install" }, ["clean", "dry-run"]),
			);

			expect(mockQuartzRunner.pluginInstall).toHaveBeenCalledWith({
				cwd: "/repo",
				fromConfig: false,
				latest: false,
				clean: true,
				dryRun: true,
			});
		});

		it("install fails when QuartzRunner is missing", async () => {
			const plugin = buildPlugin({
				settings: {
					...buildPlugin().settings,
					enableSystemCommands: true,
					quartzRepoPath: "/repo",
				},
				quartzRunner: null,
			});
			const handler = createPluginHandler(plugin);

			const result = await handler(buildParams({ action: "install" }));

			expect(result).toEqual({
				success: false,
				error: "System commands are not available. Enable them in settings and ensure Node.js is installed.",
			});
		});

		it("enable calls pluginEnable with parsed names", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "enable", name: "graph" }));

			expect(mockQuartzRunner.pluginEnable).toHaveBeenCalledWith(
				["graph"],
				{
					cwd: "/repo",
				},
			);
		});

		it("enable splits comma-separated names", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(
				buildParams({ action: "enable", name: "graph, explorer" }),
			);

			expect(mockQuartzRunner.pluginEnable).toHaveBeenCalledWith(
				["graph", "explorer"],
				{ cwd: "/repo" },
			);
		});

		it("enable fails without name parameter", async () => {
			const { plugin } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			const result = await handler(buildParams({ action: "enable" }));

			expect(result).toEqual({
				success: false,
				error: "Missing name parameter",
			});
		});

		it("disable calls pluginDisable with parsed names", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "disable", name: "graph" }));

			expect(mockQuartzRunner.pluginDisable).toHaveBeenCalledWith(
				["graph"],
				{
					cwd: "/repo",
				},
			);
		});

		it("config calls pluginConfig with set option", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(
				buildParams({ action: "config", name: "graph", set: "a=b" }),
			);

			expect(mockQuartzRunner.pluginConfig).toHaveBeenCalledWith(
				"graph",
				{
					cwd: "/repo",
					set: "a=b",
				},
			);
		});

		it("config fails without name parameter", async () => {
			const { plugin } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			const result = await handler(buildParams({ action: "config" }));

			expect(result).toEqual({
				success: false,
				error: "Missing name parameter",
			});
		});

		it("prune calls pluginPrune with dry-run", async () => {
			const { plugin, mockQuartzRunner } = buildRunnerPlugin();
			const handler = createPluginHandler(plugin);

			await handler(buildParams({ action: "prune" }, ["dry-run"]));

			expect(mockQuartzRunner.pluginPrune).toHaveBeenCalledWith({
				cwd: "/repo",
				dryRun: true,
			});
		});
	});
});
