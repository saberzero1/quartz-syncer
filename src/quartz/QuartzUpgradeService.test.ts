import assert from "node:assert";
import { QuartzUpgradeService } from "./QuartzUpgradeService";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

const originalGetQuartzPackageVersion =
	QuartzVersionDetector.getQuartzPackageVersion;
const originalFetch = global.fetch;

afterEach(() => {
	QuartzVersionDetector.getQuartzPackageVersion =
		originalGetQuartzPackageVersion;
	global.fetch = originalFetch;
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

function makeMockRepo(): RepositoryConnection {
	return {} as unknown as RepositoryConnection;
}

describe("QuartzUpgradeService", () => {
	it("detects when upstream has a newer version", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.1.0");

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, true);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.upstreamVersion, "5.1.0");
		assert.strictEqual(status.error, undefined);
	});

	it("reports no upgrade when versions match", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch("5.0.0");

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentVersion, "5.0.0");
		assert.strictEqual(status.upstreamVersion, "5.0.0");
	});

	it("reports no upgrade when upstream fetch fails", async () => {
		mockPackageVersion("5.0.0");
		mockUpstreamFetch(null, false);

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Could not determine"));
	});

	it("handles upstream fetch throwing an error", async () => {
		mockPackageVersion("5.0.0");
		global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Network error"));
	});

	it("handles missing current version gracefully", async () => {
		QuartzVersionDetector.getQuartzPackageVersion = async () => {
			throw new Error("no package.json");
		};
		mockUpstreamFetch("5.1.0");

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.currentVersion, null);
		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.upstreamVersion, "5.1.0");
	});

	it("handles null current version", async () => {
		mockPackageVersion(null);
		mockUpstreamFetch("5.1.0");

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.strictEqual(status.currentVersion, null);
	});

	it("handles upstream with no version field", async () => {
		mockPackageVersion("5.0.0");

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ name: "quartz" }),
		});

		const service = new QuartzUpgradeService(makeMockRepo());
		const status = await service.checkForUpgrade();

		assert.strictEqual(status.hasUpgrade, false);
		assert.ok(status.error?.includes("Could not determine"));
	});
});
