import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createVersionHandler } from "src/cli/handlers/versionHandler";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
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

describe("versionHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns unknown versions when repository is unavailable", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "",
			},
		});
		const handler = createVersionHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				pluginVersion: "9.9.9",
				obsidianVersion: "1.6.0",
				quartzVersion: "unknown",
				quartzPackageVersion: null,
			},
		});
	});

	it("returns detected Quartz version info", async () => {
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
		expect(result).toEqual({
			success: true,
			data: {
				pluginVersion: "9.9.9",
				obsidianVersion: "1.6.0",
				quartzVersion: "v5-json",
				quartzPackageVersion: "5.1.0",
			},
		});
	});

	it("returns errors when version detection fails", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createVersionHandler(plugin);

		vi.spyOn(
			QuartzVersionDetector,
			"detectQuartzVersion",
		).mockRejectedValue(new Error("Detection failed"));

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Detection failed",
		});
	});
});
