import assert from "node:assert";
import { QuartzUpgradeService } from "./QuartzUpgradeService";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

const originalGetQuartzPackageVersion =
	QuartzVersionDetector.getQuartzPackageVersion;
const originalFetch = global.fetch;

const originalFetchRemoteHeadCommit =
	RepositoryConnection.fetchRemoteHeadCommit;

afterEach(() => {
	QuartzVersionDetector.getQuartzPackageVersion =
		originalGetQuartzPackageVersion;
	global.fetch = originalFetch;
	RepositoryConnection.fetchRemoteHeadCommit = originalFetchRemoteHeadCommit;
});

function mockPackageVersion(version: string | null): void {
	QuartzVersionDetector.getQuartzPackageVersion = async () => version;
}

function mockUpstreamFetch(version: string | null, ok = true): void {
	global.fetch = jest.fn().mockResolvedValue({
		ok,
		json: async () => (version ? { version } : {}),
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
		global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
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

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ name: "quartz" }),
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
