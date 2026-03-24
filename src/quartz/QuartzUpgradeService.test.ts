import assert from "node:assert";
import {
	QuartzUpgradeService,
	type FetchRemoteHeadCommitFn,
} from "./QuartzUpgradeService";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

const CURRENT_COMMIT = "aaa1111222233334444555566667777888899990000";
const UPSTREAM_COMMIT = "bbb1111222233334444555566667777888899990000";

function makeMockRepo(overrides?: {
	packageVersion?: string | null;
	latestCommit?: string | null;
	getLatestCommitThrows?: boolean;
}): RepositoryConnection {
	return {
		getLatestCommit: overrides?.getLatestCommitThrows
			? async () => {
					throw new Error("fetch failed");
				}
			: async () =>
					overrides?.latestCommit !== undefined
						? overrides.latestCommit
							? {
									sha: overrides.latestCommit,
									commit: { tree: { sha: "tree" } },
								}
							: undefined
						: {
								sha: CURRENT_COMMIT,
								commit: { tree: { sha: "tree" } },
							},
	} as unknown as RepositoryConnection;
}

const originalGetQuartzPackageVersion =
	QuartzVersionDetector.getQuartzPackageVersion;

afterEach(() => {
	QuartzVersionDetector.getQuartzPackageVersion =
		originalGetQuartzPackageVersion;
});

function mockPackageVersion(version: string | null): void {
	QuartzVersionDetector.getQuartzPackageVersion = async () => version;
}

describe("QuartzUpgradeService", () => {
	it("detects when upstream has a newer commit", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => UPSTREAM_COMMIT;

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.currentCommit, CURRENT_COMMIT);
		assert.strictEqual(status.upstreamCommit, UPSTREAM_COMMIT);
		assert.strictEqual(status.error, undefined);
	});

	it("reports no upgrade when commits match", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => CURRENT_COMMIT;

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentCommit, CURRENT_COMMIT);
		assert.strictEqual(status.upstreamCommit, CURRENT_COMMIT);
	});

	it("reports no upgrade when upstream returns null", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => null;

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Could not determine"));
	});

	it("handles upstream fetch throwing an error", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => {
			throw new Error("Network error");
		};

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Network error"));
	});

	it("handles missing current commit gracefully", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => UPSTREAM_COMMIT;

		const service = new QuartzUpgradeService(
			makeMockRepo({ latestCommit: null }),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentCommit, null);
		assert.strictEqual(status.upstreamCommit, UPSTREAM_COMMIT);
	});

	it("handles getLatestCommit throwing an error", async () => {
		mockPackageVersion("5.0.0");

		const fetchFn: FetchRemoteHeadCommitFn = async () => UPSTREAM_COMMIT;

		const service = new QuartzUpgradeService(
			makeMockRepo({ getLatestCommitThrows: true }),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentCommit, null);
	});

	it("handles missing package version gracefully", async () => {
		QuartzVersionDetector.getQuartzPackageVersion = async () => {
			throw new Error("no package.json");
		};

		const fetchFn: FetchRemoteHeadCommitFn = async () => UPSTREAM_COMMIT;

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
		);

		const status = await service.checkForUpgrade();

		assert.strictEqual(status.currentVersion, null);
		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.upstreamCommit, UPSTREAM_COMMIT);
	});

	it("passes corsProxyUrl to fetchRemoteHeadCommit", async () => {
		mockPackageVersion("5.0.0");

		let capturedProxy: string | undefined;

		const fetchFn: FetchRemoteHeadCommitFn = async (
			_url,
			_auth,
			_ref,
			corsProxy,
		) => {
			capturedProxy = corsProxy;

			return UPSTREAM_COMMIT;
		};

		const service = new QuartzUpgradeService(
			makeMockRepo(),
			{ type: "none" },
			fetchFn,
			"https://proxy.example.com",
		);

		await service.checkForUpgrade();

		assert.strictEqual(capturedProxy, "https://proxy.example.com");
	});
});
