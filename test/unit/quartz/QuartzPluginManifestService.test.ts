import { beforeEach, describe, it, vi } from "vitest";
import assert from "node:assert";
import { QuartzPluginManifestService } from "src/quartz/QuartzPluginManifestService";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { fetchRemoteBranches } from "src/git/GitRemoteUtils";
import type { GitAuth } from "src/models/settings";

vi.mock("src/git/GitRemoteUtils", () => ({
	fetchRemoteBranches: vi.fn(),
}));

const mockedFetchRemoteBranches = vi.mocked(fetchRemoteBranches);

function encodeJson(obj: unknown): string {
	return JSON.stringify(obj);
}

function requireValue<T>(value: T | undefined | null, message: string): T {
	if (value === undefined || value === null) {
		throw new Error(message);
	}
	return value;
}

describe("QuartzPluginManifestService", () => {
	let service: QuartzPluginManifestService;
	let mockReadFile: ReturnType<typeof vi.fn>;
	let createRemoteFileSource: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockReadFile = vi.fn();
		createRemoteFileSource = vi.fn(
			(): QuartzFileSource => ({
				readFile: mockReadFile as QuartzFileSource["readFile"],
				writeFile: vi.fn(),
				listDirectory: vi.fn().mockResolvedValue([]),
				exists: vi.fn().mockResolvedValue(false),
			}),
		);
		mockedFetchRemoteBranches.mockResolvedValue({
			branches: ["main"],
			defaultBranch: "main",
		});

		service = new QuartzPluginManifestService(
			{ type: "bearer", secret: "test-token" },
			"https://cors.proxy",
			createRemoteFileSource as unknown as (options: {
				remoteUrl: string;
				branch: string;
				auth: GitAuth;
				corsProxyUrl?: string;
			}) => QuartzFileSource,
		);
	});

	it("fetches manifest from github string source", async () => {
		const packageJson = {
			name: "explorer",
			quartz: {
				name: "explorer",
				displayName: "Explorer",
				category: "component",
				version: "1.0.0",
			},
		};

		mockReadFile.mockResolvedValue(encodeJson(packageJson));

		const manifest = await service.fetchManifest(
			"github:quartz-community/explorer",
		);

		const entry = requireValue(manifest, "Expected manifest");
		assert.strictEqual(entry.name, "explorer");
		assert.strictEqual(entry.displayName, "Explorer");

		const ctorCall = requireValue(
			createRemoteFileSource.mock.calls[0],
			"Expected remote file source factory call",
		);
		assert.ok(ctorCall[0].remoteUrl.includes("quartz-community/explorer"));
	});

	it("fetches manifest from object source with subdir", async () => {
		const packageJson = {
			quartz: {
				name: "quartz-themes",
				category: "component",
			},
		};

		mockReadFile.mockResolvedValue(encodeJson(packageJson));

		const manifest = await service.fetchManifest({
			name: "quartz-themes",
			repo: "github:saberzero1/quartz-themes",
			subdir: "plugin",
		});

		const entry = requireValue(manifest, "Expected manifest");
		assert.strictEqual(entry.name, "quartz-themes");

		const call = requireValue(
			mockReadFile.mock.calls[0],
			"Expected readFile call",
		);
		assert.strictEqual(call[0], "plugin/package.json");
	});

	it("returns null for local path source", async () => {
		const manifest = await service.fetchManifest("./local-plugin");

		assert.strictEqual(manifest, null);
	});

	it("returns null when getRawFile throws", async () => {
		mockReadFile.mockRejectedValue(new Error("Not found"));

		const manifest = await service.fetchManifest(
			"github:quartz-community/nonexistent",
		);

		assert.strictEqual(manifest, null);
	});

	it("returns null when package.json has no quartz field", async () => {
		mockReadFile.mockResolvedValue(encodeJson({ name: "some-package" }));

		const manifest = await service.fetchManifest(
			"github:quartz-community/no-manifest",
		);

		assert.strictEqual(manifest, null);
	});

	it("caches results across calls", async () => {
		const packageJson = {
			quartz: { name: "cached-plugin", category: "transformer" },
		};

		mockReadFile.mockResolvedValue(encodeJson(packageJson));

		const first = await service.fetchManifest(
			"github:quartz-community/cached",
		);

		const second = await service.fetchManifest(
			"github:quartz-community/cached",
		);

		assert.deepStrictEqual(first, second);
		assert.strictEqual(mockReadFile.mock.calls.length, 1);
	});

	it("resolves ref from hash in string source", async () => {
		mockReadFile.mockResolvedValue(
			encodeJson({
				quartz: { name: "pinned", category: "filter" },
			}),
		);

		await service.fetchManifest("github:quartz-community/pinned#v2.0.0");

		const ctorCall = requireValue(
			createRemoteFileSource.mock.calls[0],
			"Expected remote file source factory call",
		);

		assert.strictEqual(ctorCall[0].branch, "v2.0.0");
	});

	it("clearCache allows re-fetching", async () => {
		mockReadFile.mockResolvedValue(
			encodeJson({
				quartz: { name: "refresh", category: "emitter" },
			}),
		);

		await service.fetchManifest("github:quartz-community/refresh");
		service.clearCache();
		await service.fetchManifest("github:quartz-community/refresh");

		assert.strictEqual(mockReadFile.mock.calls.length, 2);
	});
});
