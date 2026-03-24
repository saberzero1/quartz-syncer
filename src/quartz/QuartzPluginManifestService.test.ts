import { describe, it, beforeEach } from "@jest/globals";
import assert from "node:assert";
import { QuartzPluginManifestService } from "./QuartzPluginManifestService";

jest.mock("src/repositoryConnection/RepositoryConnection", () => {
	let mockGetRawFile: jest.Mock;

	return {
		RepositoryConnection: jest.fn().mockImplementation(() => ({
			getRawFile: (...args: unknown[]) => mockGetRawFile(...args),
		})),
		_setMockGetRawFile: (fn: jest.Mock) => {
			mockGetRawFile = fn;
		},
		_getMockGetRawFile: () => mockGetRawFile,
	};
});

function setMockGetRawFile(fn: jest.Mock): void {
	const mod = jest.requireMock(
		"src/repositoryConnection/RepositoryConnection",
	) as { _setMockGetRawFile: (fn: jest.Mock) => void };
	mod._setMockGetRawFile(fn);
}

function getRepoConstructor(): jest.Mock {
	const mod = jest.requireMock(
		"src/repositoryConnection/RepositoryConnection",
	) as { RepositoryConnection: jest.Mock };

	return mod.RepositoryConnection;
}

function encodeJson(obj: unknown): string {
	return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("QuartzPluginManifestService", () => {
	let service: QuartzPluginManifestService;
	let mockGetRawFile: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockGetRawFile = jest.fn();
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

		assert.ok(manifest);
		assert.strictEqual(manifest.name, "explorer");
		assert.strictEqual(manifest.displayName, "Explorer");

		const ctor = getRepoConstructor();

		assert.ok(
			ctor.mock.calls[0][0].gitSettings.remoteUrl.includes(
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
			ref: "main",
		});

		assert.ok(manifest);
		assert.strictEqual(manifest.name, "quartz-themes");
		assert.strictEqual(
			mockGetRawFile.mock.calls[0][0],
			"plugin/package.json",
		);
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

		assert.strictEqual(ctor.mock.calls[0][0].gitSettings.branch, "v2.0.0");
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
