import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRepoHandler } from "src/cli/handlers/repoHandler";
import { buildParams, buildPlugin } from "./helpers";

const {
	externalFileExists,
	externalIsDirectorySync,
	expandTilde,
	isAbsolutePath,
} = vi.hoisted(() => ({
	externalFileExists: vi.fn(),
	externalIsDirectorySync: vi.fn(),
	expandTilde: vi.fn((path: string) => path),
	isAbsolutePath: vi.fn(),
}));

const { detectQuartzVersion } = vi.hoisted(() => ({
	detectQuartzVersion: vi.fn(),
}));

const { LocalFileSource } = vi.hoisted(() => ({
	LocalFileSource: vi.fn(),
}));

vi.mock("src/utils/external-fs", () => ({
	externalFileExists,
	externalIsDirectorySync,
	expandTilde,
	isAbsolutePath,
}));

vi.mock("src/quartz/QuartzVersionDetector", () => ({
	QuartzVersionDetector: { detectQuartzVersion },
}));

vi.mock("src/quartz/LocalFileSource", () => ({
	LocalFileSource,
}));

describe("repoHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		expandTilde.mockImplementation((path: string) => path);
	});

	it("set-local with valid absolute path returns local mode", async () => {
		expandTilde.mockReturnValue("/repo");
		isAbsolutePath.mockReturnValue(true);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		externalFileExists.mockImplementation(
			async (path: string) => path === "/repo/content",
		);
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(
			buildParams({ action: "set-local", path: "/repo" }),
		);
		expect(result).toEqual({
			success: true,
			data: {
				mode: "local",
				localPath: "/repo",
				quartzVersion: "v5-json",
			},
		});
	});

	it("set-local returns error when path is missing", async () => {
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "set-local" }));
		expect(result).toEqual({
			success: false,
			error: "Missing path parameter",
		});
	});

	it("set-local returns error for relative paths", async () => {
		expandTilde.mockReturnValue("relative/path");
		isAbsolutePath.mockReturnValue(false);
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		const result = await handler(
			buildParams({ action: "set-local", path: "relative/path" }),
		);
		expect(result).toEqual({
			success: false,
			error: "Path must be absolute",
		});
	});

	it("set-local returns error when directory does not exist", async () => {
		expandTilde.mockReturnValue("/missing");
		isAbsolutePath.mockReturnValue(true);
		externalIsDirectorySync.mockReturnValue(false);
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		const result = await handler(
			buildParams({ action: "set-local", path: "/missing" }),
		);
		expect(result).toEqual({
			success: false,
			error: "Directory not found: /missing",
		});
	});

	it("set-local returns error when Quartz config missing", async () => {
		expandTilde.mockReturnValue("/repo");
		isAbsolutePath.mockReturnValue(true);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("unknown");
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		const result = await handler(
			buildParams({ action: "set-local", path: "/repo" }),
		);
		expect(result).toEqual({
			success: false,
			error: "Not a valid Quartz repository: No Quartz configuration files found",
		});
	});

	it("set-local calls expandTilde", async () => {
		expandTilde.mockReturnValue("/repo");
		isAbsolutePath.mockReturnValue(true);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		externalFileExists.mockResolvedValue(true);
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		await handler(buildParams({ action: "set-local", path: "~/repo" }));
		expect(expandTilde).toHaveBeenCalledWith("~/repo");
	});

	it("set-local saves settings on success", async () => {
		expandTilde.mockReturnValue("/repo");
		isAbsolutePath.mockReturnValue(true);
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		externalFileExists.mockResolvedValue(true);
		const saveSettings = vi.fn();
		const plugin = buildPlugin({ saveSettings });
		const handler = createRepoHandler(plugin);

		await handler(buildParams({ action: "set-local", path: "/repo" }));
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it("set-remote clears local path and returns remote mode", async () => {
		const saveSettings = vi.fn();
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
				gitRemoteUrl: "https://example.com/repo.git",
				contentFolder: "content",
			},
			saveSettings,
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "set-remote" }));
		expect(plugin.settings.quartzRepoPath).toBe("");
		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			success: true,
			data: {
				mode: "remote",
				remoteUrl: "https://example.com/repo.git",
				branch: "main",
			},
		});
	});

	it("set-remote returns none when no remote configured", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "set-remote" }));
		expect(result).toEqual({
			success: true,
			data: {
				mode: "none",
				remoteUrl: null,
				branch: "main",
			},
		});
	});

	it("info returns current repo configuration", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
				gitRemoteUrl: "https://example.com/repo.git",
				gitBranch: "main",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "info" }));
		expect(result).toEqual({
			success: true,
			data: {
				mode: "local",
				localPath: "/repo",
				remoteUrl: "https://example.com/repo.git",
				branch: "main",
				contentFolder: "content",
			},
		});
	});

	it("verify returns valid when repo passes validation", async () => {
		expandTilde.mockReturnValue("/repo");
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		externalFileExists.mockResolvedValue(true);
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "verify" }));
		expect(result).toEqual({
			success: true,
			data: {
				path: "/repo",
				valid: true,
				quartzVersion: "v5-json",
				reason: undefined,
			},
			error: undefined,
		});
	});

	it("verify returns invalid when content folders are missing", async () => {
		expandTilde.mockReturnValue("/repo");
		externalIsDirectorySync.mockReturnValue(true);
		detectQuartzVersion.mockResolvedValue("v5-json");
		externalFileExists.mockResolvedValue(false);
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/repo",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "verify" }));
		expect(result).toEqual({
			success: false,
			data: {
				path: "/repo",
				valid: false,
				quartzVersion: "v5-json",
				reason: "No content directory found",
			},
			error: "No content directory found",
		});
	});

	it("verify returns error when no path and no local repo configured", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "",
				contentFolder: "content",
			},
		});
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "verify" }));
		expect(result).toEqual({
			success: false,
			error: "No path provided and no local repo configured",
		});
	});

	it("returns error for unknown action", async () => {
		const plugin = buildPlugin();
		const handler = createRepoHandler(plugin);

		const result = await handler(buildParams({ action: "unknown" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: unknown",
		});
	});
});
