import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createPluginHandler } from "src/cli/handlers/pluginHandler";
import { buildParams, buildPlugin, makeBackend } from "./helpers";

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
});
