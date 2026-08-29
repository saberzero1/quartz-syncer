import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createTestHandler } from "src/cli/handlers/testHandler";
import { buildParams, buildPlugin } from "./helpers";

const { externalFileExists, externalIsDirectorySync } = vi.hoisted(() => ({
	externalFileExists: vi.fn(),
	externalIsDirectorySync: vi.fn(),
}));

const { detectQuartzVersion } = vi.hoisted(() => ({
	detectQuartzVersion: vi.fn(),
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

vi.mock("src/utils/external-fs", () => ({
	externalFileExists,
	externalIsDirectorySync,
}));

vi.mock("src/quartz/QuartzVersionDetector", () => ({
	QuartzVersionDetector: { detectQuartzVersion },
}));

describe("testHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tests git connection when configured", async () => {
		const backend = {
			testConnection: vi.fn(async () => ({
				ok: true,
				readAccess: true,
				writeAccess: true,
			})),
		} as unknown as GitBackend;
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				ok: true,
				readAccess: true,
				writeAccess: true,
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
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("returns connection errors from the backend", async () => {
		const backend = {
			testConnection: vi.fn(async () => ({
				ok: false,
				readAccess: false,
				writeAccess: false,
				error: "Connection failed",
			})),
		} as unknown as GitBackend;
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Connection failed",
		});
	});

	it("validates local repositories when configured", async () => {
		externalFileExists.mockImplementation(
			async (path: string) =>
				path === "/repo" || path === "/repo/content",
		);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
			},
		});
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result.success).toBe(true);
		const data = result.data as {
			mode: string;
			checks: Array<{ passed: boolean }>;
		};
		expect(data.mode).toBe("local");
		expect(data.checks.every((check) => check.passed)).toBe(true);
	});

	it("returns an error when local path does not exist", async () => {
		externalFileExists.mockResolvedValue(false);
		externalIsDirectorySync.mockReturnValue(false);
		detectQuartzVersion.mockResolvedValue("unknown");
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/missing",
			},
		});
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			data: {
				mode: "local",
				checks: [
					{
						check: "Path exists",
						passed: false,
						detail: "/missing not found",
					},
				],
			},
			error: "Local repository path does not exist",
		});
	});

	it("reports missing config files in local mode", async () => {
		externalFileExists.mockImplementation(
			async (path: string) =>
				path === "/repo" || path === "/repo/content",
		);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("unknown");
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
			},
		});
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result.success).toBe(false);
		const data = result.data as {
			checks: Array<{ check: string; passed: boolean; detail?: string }>;
		};
		const configCheck = data.checks.find(
			(check) => check.check === "Quartz config detected",
		);
		expect(configCheck).toEqual({
			check: "Quartz config detected",
			passed: false,
			detail: "No config files found",
		});
	});
});
