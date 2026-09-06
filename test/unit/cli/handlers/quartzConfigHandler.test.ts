import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createQuartzConfigHandler } from "src/cli/handlers/quartzConfigHandler";
import { buildParams, buildPlugin, makeBackend } from "./helpers";
import {
	QuartzCompatibility,
	V4_MANAGEMENT_UNSUPPORTED,
} from "src/quartz/QuartzCompatibility";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";

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

describe("quartzConfigHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe.each<QuartzVersion>(["v4", "unknown"])(
		"management gating for %s",
		(version) => {
			it.each(["list", "get", "set"])(
				"blocks %s before reading or writing config",
				async (action) => {
					const backend = makeBackend({});
					setBackend(backend);
					const plugin = buildPlugin();
					plugin.quartzCompatibility = new QuartzCompatibility(
						plugin,
					);
					vi.spyOn(
						plugin.quartzCompatibility,
						"getVersion",
					).mockResolvedValue(version);

					const result = await createQuartzConfigHandler(plugin)(
						buildParams({
							action,
							key: "configuration.pageTitle",
							value: "Updated",
						}),
					);

					expect(result).toEqual({
						success: false,
						error: V4_MANAGEMENT_UNSUPPORTED,
					});
					expect(backend.readTree).not.toHaveBeenCalled();
					expect(backend.readBlob).not.toHaveBeenCalled();
					expect(backend.writeFiles).not.toHaveBeenCalled();
				},
			);
		},
	);

	it("lists the Quartz configuration by default", async () => {
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

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				configuration: { pageTitle: "Test" },
				plugins: [],
			},
		});
	});

	it("gets and sets Quartz configuration values", async () => {
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
		expect(getResult).toEqual({
			success: true,
			data: { key: "configuration.pageTitle", value: "Test" },
		});

		const setResult = await handler(
			buildParams({
				action: "set",
				key: "configuration.pageTitle",
				value: "Updated",
			}),
		);
		expect(setResult).toEqual({
			success: true,
			data: { key: "configuration.pageTitle", value: "Updated" },
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
		const handler = createQuartzConfigHandler(plugin);

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
		const handler = createQuartzConfigHandler(plugin);

		const missingKey = await handler(buildParams({ action: "get" }));
		expect(missingKey).toEqual({
			success: false,
			error: "Missing key parameter",
		});

		const missingValue = await handler(
			buildParams({ action: "set", key: "configuration.pageTitle" }),
		);
		expect(missingValue).toEqual({
			success: false,
			error: "Missing value parameter",
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
		const handler = createQuartzConfigHandler(plugin);

		const result = await handler(buildParams({ action: "refresh" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: refresh",
		});
	});
});
