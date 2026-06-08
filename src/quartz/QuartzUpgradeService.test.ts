import assert from "node:assert";
import { QuartzUpgradeService } from "./QuartzUpgradeService";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { requestUrl } from "obsidian";

const mockedRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

const originalGetQuartzPackageVersion =
	QuartzVersionDetector.getQuartzPackageVersion;

const originalFetchRemoteHeadCommit =
	RepositoryConnection.fetchRemoteHeadCommit;

afterEach(() => {
	QuartzVersionDetector.getQuartzPackageVersion =
		originalGetQuartzPackageVersion;
	mockedRequestUrl.mockReset();
	RepositoryConnection.fetchRemoteHeadCommit = originalFetchRemoteHeadCommit;
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
	RepositoryConnection.fetchRemoteHeadCommit = async (): Promise<
		string | null
	> => sha;
}

function makeMockRepo(commitInHistory = false): RepositoryConnection {
	return {
		hasCommitInHistory: async () => commitInHistory,
	} as unknown as RepositoryConnection;
}

function makeService(commitInHistory = false): QuartzUpgradeService {
	return new QuartzUpgradeService(makeMockRepo(commitInHistory));
}

describe("QuartzUpgradeService", () => {
	it("detects when upstream has a newer version", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService(true).checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.upstreamVersion, "5.1.0");
		assert.strictEqual(status.error, undefined);
	});

	it("reports no upgrade when versions match", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService(true).checkForUpgrade();

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

		const status = await makeService(true).checkForUpgrade();

		assert.strictEqual(status.currentVersion, null);
		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.upstreamVersion, "5.1.0");
	});

	it("handles null current version", async () => {
		mockPackageVersion(null);
		mockUpstreamFetch("5.1.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService(true).checkForUpgrade();

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

	it("detects newer commits when upstream SHA not in user's repo", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("def5678");

		const status = await makeService(false).checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.hasNewerCommits, true);
		assert.strictEqual(status.latestUpstreamSha, "def5678");
	});

	it("reports no newer commits when upstream SHA is in user's repo", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("def5678");

		const status = await makeService(true).checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.hasNewerCommits, false);
	});

	it("reports hasNewerCommits=false when commit found in history", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService(true).checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, false);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});

	it("reports hasNewerCommits=true when commit not found in history", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");
		mockRemoteHeadCommit("abc1234");

		const status = await makeService(false).checkForUpgrade();

		assert.strictEqual(status.hasNewerCommits, true);
		assert.strictEqual(status.latestUpstreamSha, "abc1234");
	});
});

describe("QuartzUpgradeService.performUpgrade", () => {
	it("returns success on clean merge", async () => {
		const mockRepo = {
			hasCommitInHistory: async () => true,
			upgradeFromUpstream: async () => ({
				oid: "abc123",
				alreadyMerged: false,
			}),
		} as unknown as RepositoryConnection;

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.oid, "abc123");
		assert.strictEqual(result.alreadyMerged, false);
	});

	it("returns success when already merged", async () => {
		const mockRepo = {
			hasCommitInHistory: async () => true,
			upgradeFromUpstream: async () => ({
				oid: "abc123",
				alreadyMerged: true,
			}),
		} as unknown as RepositoryConnection;

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.alreadyMerged, true);
	});

	it("detects 'Cannot auto-upgrade' as conflict error", async () => {
		const mockRepo = {
			hasCommitInHistory: async () => true,
			upgradeFromUpstream: async () => {
				throw new Error(
					"Cannot auto-upgrade: you have modified framework files",
				);
			},
		} as unknown as RepositoryConnection;

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Cannot auto-upgrade"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("detects 'Merge conflicts in' as conflict error", async () => {
		const mockRepo = {
			hasCommitInHistory: async () => true,
			upgradeFromUpstream: async () => {
				throw new Error(
					"Merge conflicts in: package.json, tsconfig.json",
				);
			},
		} as unknown as RepositoryConnection;

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Merge conflicts in:"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("treats non-conflict errors as generic failures", async () => {
		const mockRepo = {
			hasCommitInHistory: async () => true,
			upgradeFromUpstream: async () => {
				throw new Error("Network timeout");
			},
		} as unknown as RepositoryConnection;

		const service = new QuartzUpgradeService(mockRepo);
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Network timeout"));
		assert.ok(!result.error?.includes("npx quartz upgrade"));
	});
});
