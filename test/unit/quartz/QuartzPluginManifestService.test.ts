import { beforeEach, describe, it, vi } from "vitest";
import assert from "node:assert";
import { Buffer } from "buffer";
import { QuartzPluginManifestService } from "src/quartz/QuartzPluginManifestService";

vi.mock("src/repositoryConnection/RepositoryConnection", () => {
	let mockGetRawFile: (...args: unknown[]) => unknown = vi.fn();

	const MockRepositoryConnection = vi.fn(
		class MockRepositoryConnection {
			getRawFile: (...args: unknown[]) => unknown;

			constructor() {
				this.getRawFile = (...args: unknown[]) =>
					mockGetRawFile(...args);
			}
		},
	);

	(
		MockRepositoryConnection as unknown as {
			fetchRemoteBranches: ReturnType<typeof vi.fn>;
		}
	).fetchRemoteBranches = vi.fn().mockResolvedValue({
		branches: ["main"],
		defaultBranch: "main",
	});

	return {
		RepositoryConnection: MockRepositoryConnection,
		_setMockGetRawFile: (fn: (...args: unknown[]) => unknown) => {
			mockGetRawFile = fn;
		},
		_getMockGetRawFile: () => mockGetRawFile,
	};
});

import * as RepoModule from "src/repositoryConnection/RepositoryConnection";

type RepoMockModule = typeof RepoModule & {
	_setMockGetRawFile: (fn: ReturnType<typeof vi.fn>) => void;
	RepositoryConnection: ReturnType<typeof vi.fn>;
};

function setMockGetRawFile(fn: ReturnType<typeof vi.fn>): void {
	(RepoModule as RepoMockModule)._setMockGetRawFile(fn);
}

function getRepoConstructor(): ReturnType<typeof vi.fn> {
	return (RepoModule as RepoMockModule).RepositoryConnection;
}

function encodeJson(obj: unknown): string {
	return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function requireValue<T>(value: T | undefined | null, message: string): T {
	if (value === undefined || value === null) {
		throw new Error(message);
	}
	return value;
}

describe("QuartzPluginManifestService", () => {
	let service: QuartzPluginManifestService;
	let mockGetRawFile: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRawFile = vi.fn();
		setMockGetRawFile(mockGetRawFile);

		service = new QuartzPluginManifestService(
			{ type: "bearer", secret: "test-token" },
			"https://cors.proxy",
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

		mockGetRawFile.mockResolvedValue({
			content: encodeJson(packageJson),
			sha: "abc",
			path: "package.json",
			type: "file",
		});

		const manifest = await service.fetchManifest(
			"github:quartz-community/explorer",
		);

		const entry = requireValue(manifest, "Expected manifest");
		assert.strictEqual(entry.name, "explorer");
		assert.strictEqual(entry.displayName, "Explorer");

		const ctor = getRepoConstructor();

		const ctorCall = requireValue(
			ctor.mock.calls[0],
			"Expected RepositoryConnection constructor call",
		);
		assert.ok(
			ctorCall[0].gitSettings.remoteUrl.includes(
				"quartz-community/explorer",
			),
		);
	});

	it("fetches manifest from object source with subdir", async () => {
		const packageJson = {
			quartz: {
				name: "quartz-themes",
				category: "component",
			},
		};

		mockGetRawFile.mockResolvedValue({
			content: encodeJson(packageJson),
			sha: "def",
			path: "plugin/package.json",
			type: "file",
		});

		const manifest = await service.fetchManifest({
			name: "quartz-themes",
			repo: "github:saberzero1/quartz-themes",
			subdir: "plugin",
		});

		const entry = requireValue(manifest, "Expected manifest");
		assert.strictEqual(entry.name, "quartz-themes");

		const call = requireValue(
			mockGetRawFile.mock.calls[0],
			"Expected getRawFile call",
		);
		assert.strictEqual(call[0], "plugin/package.json");
	});

	it("returns null for local path source", async () => {
		const manifest = await service.fetchManifest("./local-plugin");

		assert.strictEqual(manifest, null);
	});

	it("returns null when getRawFile throws", async () => {
		mockGetRawFile.mockRejectedValue(new Error("Not found"));

		const manifest = await service.fetchManifest(
			"github:quartz-community/nonexistent",
		);

		assert.strictEqual(manifest, null);
	});

	it("returns null when package.json has no quartz field", async () => {
		mockGetRawFile.mockResolvedValue({
			content: encodeJson({ name: "some-package" }),
			sha: "abc",
			path: "package.json",
			type: "file",
		});

		const manifest = await service.fetchManifest(
			"github:quartz-community/no-manifest",
		);

		assert.strictEqual(manifest, null);
	});

	it("caches results across calls", async () => {
		const packageJson = {
			quartz: { name: "cached-plugin", category: "transformer" },
		};

		mockGetRawFile.mockResolvedValue({
			content: encodeJson(packageJson),
			sha: "abc",
			path: "package.json",
			type: "file",
		});

		const first = await service.fetchManifest(
			"github:quartz-community/cached",
		);

		const second = await service.fetchManifest(
			"github:quartz-community/cached",
		);

		assert.deepStrictEqual(first, second);
		assert.strictEqual(mockGetRawFile.mock.calls.length, 1);
	});

	it("resolves ref from hash in string source", async () => {
		mockGetRawFile.mockResolvedValue({
			content: encodeJson({
				quartz: { name: "pinned", category: "filter" },
			}),
			sha: "abc",
			path: "package.json",
			type: "file",
		});

		await service.fetchManifest("github:quartz-community/pinned#v2.0.0");

		const ctor = getRepoConstructor();
		const ctorCall = requireValue(
			ctor.mock.calls[0],
			"Expected RepositoryConnection constructor call",
		);

		assert.strictEqual(ctorCall[0].gitSettings.branch, "v2.0.0");
	});

	it("clearCache allows re-fetching", async () => {
		mockGetRawFile.mockResolvedValue({
			content: encodeJson({
				quartz: { name: "refresh", category: "emitter" },
			}),
			sha: "abc",
			path: "package.json",
			type: "file",
		});

		await service.fetchManifest("github:quartz-community/refresh");
		service.clearCache();
		await service.fetchManifest("github:quartz-community/refresh");

		assert.strictEqual(mockGetRawFile.mock.calls.length, 2);
	});
});
