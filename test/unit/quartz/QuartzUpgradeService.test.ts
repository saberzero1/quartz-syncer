import assert from "node:assert";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuartzUpgradeService } from "src/quartz/QuartzUpgradeService";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { requestUrl } from "obsidian";
import { fetchRemoteHeadCommit } from "src/git/GitRemoteUtils";
import {
	QuartzCompatibility,
	V4_MANAGEMENT_UNSUPPORTED,
} from "src/quartz/QuartzCompatibility";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";
import { buildPlugin } from "../cli/handlers/helpers";

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
		writeBinaryFile: async () => {},
		deleteFile: async () => {},
		listDirectory: async () => [],
		listAllFiles: async () => [],
		exists: async () => false,
	};
}

function makeCompatibility(
	version: QuartzVersion = "v5-yaml",
): QuartzCompatibility {
	const compatibility = new QuartzCompatibility(buildPlugin());
	vi.spyOn(compatibility, "getVersion").mockResolvedValue(version);
	return compatibility;
}

function makeService(): QuartzUpgradeService {
	return new QuartzUpgradeService(makeMockRepo(), makeCompatibility());
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
		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());

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
		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());

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
		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());

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
			...makeMockRepo(),
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

		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.oid, "abc123");
		assert.strictEqual(result.alreadyMerged, false);
	});

	it("returns success when already merged", async () => {
		const mockRepo = {
			...makeMockRepo(),
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

		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, true);
		assert.strictEqual(result.alreadyMerged, true);
	});

	it("detects 'Cannot auto-upgrade' as conflict error", async () => {
		const mockRepo = {
			...makeMockRepo(),
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

		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Cannot auto-upgrade"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("detects 'Merge conflicts in' as conflict error", async () => {
		const mockRepo = {
			...makeMockRepo(),
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

		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Merge conflicts in:"));
		assert.ok(result.error?.includes("npx quartz upgrade"));
	});

	it("treats non-conflict errors as generic failures", async () => {
		const mockRepo = {
			...makeMockRepo(),
			upgradeFromUpstream: async () => {
				throw new Error("Network timeout");
			},
		} satisfies QuartzFileSource & {
			upgradeFromUpstream: () => Promise<{
				oid: string;
				alreadyMerged: boolean;
			}>;
		};

		const service = new QuartzUpgradeService(mockRepo, makeCompatibility());
		const result = await service.performUpgrade();

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes("Network timeout"));
		assert.ok(!result.error?.includes("npx quartz upgrade"));
	});
});

describe.each<QuartzVersion>(["v4", "unknown"])(
	"upgrade gating for %s",
	(version) => {
		it("refuses upgrade checks without contacting upstream", async () => {
			const repo = { ...makeMockRepo(), readFile: vi.fn() };
			const service = new QuartzUpgradeService(
				repo,
				makeCompatibility(version),
			);

			expect(await service.checkForUpgrade()).toEqual({
				currentVersion: null,
				upstreamVersion: null,
				hasUpgrade: false,
				latestUpstreamSha: null,
				hasNewerCommits: false,
				error: V4_MANAGEMENT_UNSUPPORTED,
			});
			expect(repo.readFile).not.toHaveBeenCalled();
			expect(mockedRequestUrl).not.toHaveBeenCalled();
			expect(fetchRemoteHeadCommit).not.toHaveBeenCalled();
		});

		it("refuses upstream merges without modifying the repository", async () => {
			const repo = { ...makeMockRepo(), upgradeFromUpstream: vi.fn() };
			const service = new QuartzUpgradeService(
				repo,
				makeCompatibility(version),
			);

			expect(await service.performUpgrade()).toEqual({
				success: false,
				error: V4_MANAGEMENT_UNSUPPORTED,
			});
			expect(repo.upgradeFromUpstream).not.toHaveBeenCalled();
		});

		it("refuses local runner upgrades before running commands", async () => {
			const update = vi.fn();
			const repo = { ...makeMockRepo(), upgradeFromUpstream: vi.fn() };
			const service = new QuartzUpgradeService(
				repo,
				makeCompatibility(version),
				{
					enableSystemCommands: true,
					quartzRepoPath: "/repo",
					quartzRunner: { update } as unknown as QuartzRunner,
				},
			);

			expect(await service.performUpgrade()).toEqual({
				success: false,
				error: V4_MANAGEMENT_UNSUPPORTED,
			});
			expect(update).not.toHaveBeenCalled();
			expect(repo.upgradeFromUpstream).not.toHaveBeenCalled();
		});
	},
);

it.each<QuartzVersion>(["v5-yaml", "v5-json"])(
	"allows local runner upgrades for %s",
	async (version) => {
		const update = vi.fn().mockResolvedValue({ ok: true });
		const service = new QuartzUpgradeService(
			makeMockRepo(),
			makeCompatibility(version),
			{
				enableSystemCommands: true,
				quartzRepoPath: "/repo",
				quartzRunner: { update } as unknown as QuartzRunner,
			},
		);

		expect(await service.performUpgrade()).toEqual({ success: true });
		expect(update).toHaveBeenCalledWith({ cwd: "/repo" });
	},
);
