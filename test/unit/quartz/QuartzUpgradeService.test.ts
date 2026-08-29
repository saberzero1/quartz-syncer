import assert from "node:assert";
import { afterEach, describe, it, vi } from "vitest";
import { QuartzUpgradeService } from "src/quartz/QuartzUpgradeService";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { requestUrl } from "obsidian";
import { fetchRemoteHeadCommit } from "src/git/GitRemoteUtils";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return {
		...actual,
		requestUrl: vi.fn(),
	};
});

vi.mock("src/git/GitRemoteUtils", () => ({
	fetchRemoteHeadCommit: vi.fn(),
}));

const mockedRequestUrl = vi.mocked(requestUrl);

const originalGetQuartzPackageVersion =
	QuartzVersionDetector.getQuartzPackageVersion;

afterEach(() => {
	QuartzVersionDetector.getQuartzPackageVersion =
		originalGetQuartzPackageVersion;
	mockedRequestUrl.mockReset();
	vi.mocked(fetchRemoteHeadCommit).mockReset();
});

function mockPackageVersion(version: string | null): void {
	QuartzVersionDetector.getQuartzPackageVersion = async () => version;
}

function mockUpstreamFetch(version: string | null, ok = true): void {
	const status = ok ? 200 : 500;

	mockedRequestUrl.mockResolvedValue({
		status,
		json: version ? { version } : {},
		text: JSON.stringify(version ? { version } : {}),
		arrayBuffer: new ArrayBuffer(0),
		headers: {},
	});
}

function mockRemoteHeadCommit(sha: string | null): void {
	vi.mocked(fetchRemoteHeadCommit).mockResolvedValue(sha);
}

function makeMockRepo(): QuartzFileSource {
	return {
		readFile: async () => null,
		writeFile: async () => {},
		listDirectory: async () => [],
		exists: async () => false,
	};
}

function makeService(): QuartzUpgradeService {
	return new QuartzUpgradeService(makeMockRepo());
}

describe("QuartzUpgradeService", () => {
	it("detects when upstream has a newer version", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.upstreamVersion, "5.1.0");
		assert.strictEqual(status.error, undefined);
	});

	it("reports no upgrade when versions match", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.upstreamVersion, "5.0.0");
	});

	it("reports no upgrade when upstream fetch fails", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch(null, false);
		mockRemoteHeadCommit(null);

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Could not determine"));
	});

	it("handles upstream fetch throwing an error", async () => {
		mockPackageVersion("5.0.0");
		mockedRequestUrl.mockRejectedValue(new Error("Network error"));
		mockRemoteHeadCommit(null);

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Network error"));
	});

	it("handles missing current version gracefully", async () => {
		QuartzVersionDetector.getQuartzPackageVersion = async () => {
			throw new Error("no package.json");
		};
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.currentVersion, null);
		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.upstreamVersion, "5.1.0");
	});

	it("handles null current version", async () => {
		mockPackageVersion(null);
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentVersion, null);
	});

	it("handles upstream with no version field", async () => {
		mockPackageVersion("5.0.0");

		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: { name: "quartz" },
			text: JSON.stringify({ name: "quartz" }),
			arrayBuffer: new ArrayBuffer(0),
			headers: {},
		});
		mockRemoteHeadCommit(null);

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Could not determine"));
	});

	it("falls back to version comparison when hasCommitInHistory not available (versions match)", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("def5678");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "def5678");
	});

	it("falls back to hasUpgrade when no history checker (versions match)", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("def5678");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.hasNewerCommits, false);
	});

	it("falls back to version comparison when hasCommitInHistory not provided", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("hasNewerCommits matches hasUpgrade when no history checker", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("reports hasNewerCommits=false when hasCommitInHistory finds the SHA", async () => {
		const mockRepo = {
			...makeMockRepo(),
			hasCommitInHistory: async () => true,
		} satisfies QuartzFileSource & {
			hasCommitInHistory: (sha: string) => Promise<boolean>;
		};
		const service = new QuartzUpgradeService(mockRepo);

		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("reports hasNewerCommits=true when hasCommitInHistory does not find the SHA", async () => {
		const mockRepo = {
			...makeMockRepo(),
			hasCommitInHistory: async () => false,
		} satisfies QuartzFileSource & {
			hasCommitInHistory: (sha: string) => Promise<boolean>;
		};
		const service = new QuartzUpgradeService(mockRepo);

		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, true);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("falls back to hasUpgrade when hasCommitInHistory throws", async () => {
		const mockRepo = {
			...makeMockRepo(),
			hasCommitInHistory: async () => {
				throw new Error("fail");
			},
		} satisfies QuartzFileSource & {
			hasCommitInHistory: (sha: string) => Promise<boolean>;
		};
		const service = new QuartzUpgradeService(mockRepo);

		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("hasNewerCommits=true when versions differ and no hasCommitInHistory", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService().checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.hasNewerCommits, true);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});
});

describe("QuartzUpgradeService.performUpgrade", () => {
	it("returns success on clean merge", async () => {
		const mockRepo = {
			readFile: async () => null,
			writeFile: async () => {},
			listDirectory: async () => [],
			exists: async () => false,
			upgradeFromUpstream: async () => ({
				oid: "abc123",
				alreadyMerged: false,
			}),
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.oid, "abc123");
		assert.strictEqual(result.alreadyMerged, false);
	});

	it("returns success when already merged", async () => {
		const mockRepo = {
			readFile: async () => null,
			writeFile: async () => {},
			listDirectory: async () => [],
			exists: async () => false,
			upgradeFromUpstream: async () => ({
				oid: "abc123",
				alreadyMerged: true,
			}),
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.alreadyMerged, true);
	});

	it("detects 'Cannot auto-upgrade' as conflict error", async () => {
		const mockRepo = {
			readFile: async () => null,
			writeFile: async () => {},
			listDirectory: async () => [],
			exists: async () => false,
			upgradeFromUpstream: async () => {
				throw new Error(
					"Cannot auto-upgrade: you have modified framework files",
				);
			},
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Cannot auto-upgrade"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("detects 'Merge conflicts in' as conflict error", async () => {
		const mockRepo = {
			readFile: async () => null,
			writeFile: async () => {},
			listDirectory: async () => [],
			exists: async () => false,
			upgradeFromUpstream: async () => {
				throw new Error(
					"Merge conflicts in: package.json, tsconfig.json",
				);
			},
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Merge conflicts in:"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("treats non-conflict errors as generic failures", async () => {
		const mockRepo = {
			readFile: async () => null,
			writeFile: async () => {},
			listDirectory: async () => [],
			exists: async () => false,
			upgradeFromUpstream: async () => {
				throw new Error("Network timeout");
			},
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Network timeout"));
		assert.ok(!result.error?.includes("npx quartz upgrade"));
	});
});
