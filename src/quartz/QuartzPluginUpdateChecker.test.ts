import assert from "node:assert";
import { QuartzPluginUpdateChecker } from "./QuartzPluginUpdateChecker";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type { QuartzPluginEntry, QuartzLockFile } from "./QuartzConfigTypes";

const originalFetchRemoteHeadCommit =
	RepositoryConnection.fetchRemoteHeadCommit;

afterEach(() => {
	RepositoryConnection.fetchRemoteHeadCommit = originalFetchRemoteHeadCommit;
});

function mockFetchRemoteHeadCommit(
	results: Record<string, string | null>,
): void {
	RepositoryConnection.fetchRemoteHeadCommit = async (
		url: string,
	): Promise<string | null> => {
		return results[url] ?? null;
	};
}

const PLUGIN_EXPLORER: QuartzPluginEntry = {
	source: "github:quartz-community/explorer",
	enabled: true,
};

const PLUGIN_SEARCH: QuartzPluginEntry = {
	source: "github:quartz-community/search",
	enabled: true,
};

const _PLUGIN_WITH_REF: QuartzPluginEntry = {
	source: "github:quartz-community/toc#v2",
	enabled: true,
};

const LOCK_FILE: QuartzLockFile = {
	version: "1.0.0",
	plugins: {
		"github:quartz-community/explorer": {
			source: "github:quartz-community/explorer",
			resolved: "https://github.com/quartz-community/explorer.git",
			commit: "aaa1111222233334444555566667777888899990000",
			installedAt: "2026-03-20T00:00:00Z",
		},
		"github:quartz-community/search": {
			source: "github:quartz-community/search",
			resolved: "https://github.com/quartz-community/search.git",
			commit: "bbb1111222233334444555566667777888899990000",
			installedAt: "2026-03-20T00:00:00Z",
		},
	},
};

describe("QuartzPluginUpdateChecker", () => {
	it("detects when a plugin has an update", async () => {
		mockFetchRemoteHeadCommit({
			"https://github.com/quartz-community/explorer.git":
				"ccc0000000000000000000000000000000000000",
			"https://github.com/quartz-community/search.git":
				"bbb1111222233334444555566667777888899990000",
		});

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates(
			[PLUGIN_EXPLORER, PLUGIN_SEARCH],
			LOCK_FILE,
		);

		assert.strictEqual(results.length, 2);

		const explorer = results.find(
			(r) => r.sourceKey === "github:quartz-community/explorer",
		)!;
		assert.strictEqual(explorer.hasUpdate, true);

		assert.strictEqual(
			explorer.remoteCommit,
			"ccc0000000000000000000000000000000000000",
		);

		const search = results.find(
			(r) => r.sourceKey === "github:quartz-community/search",
		)!;
		assert.strictEqual(search.hasUpdate, false);
	});

	it("reports no update when lock commit matches remote", async () => {
		mockFetchRemoteHeadCommit({
			"https://github.com/quartz-community/explorer.git":
				"aaa1111222233334444555566667777888899990000",
		});

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates(
			[PLUGIN_EXPLORER],
			LOCK_FILE,
		);

		assert.strictEqual(results[0].hasUpdate, false);

		assert.strictEqual(
			results[0].lockedCommit,
			"aaa1111222233334444555566667777888899990000",
		);
	});

	it("returns hasUpdate=false when plugin has no lock entry", async () => {
		mockFetchRemoteHeadCommit({});

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const unlocked: QuartzPluginEntry = {
			source: "github:quartz-community/new-plugin",
			enabled: true,
		};

		const results = await checker.checkUpdates([unlocked], LOCK_FILE);

		assert.strictEqual(results[0].hasUpdate, false);
		assert.strictEqual(results[0].lockedCommit, null);
	});

	it("handles remote fetch failure gracefully", async () => {
		RepositoryConnection.fetchRemoteHeadCommit = async (): Promise<
			string | null
		> => {
			throw new Error("Network error");
		};

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates(
			[PLUGIN_EXPLORER],
			LOCK_FILE,
		);

		assert.strictEqual(results[0].hasUpdate, false);
		assert.strictEqual(results[0].error, "Network error");
	});

	it("handles null remote commit", async () => {
		mockFetchRemoteHeadCommit({
			"https://github.com/quartz-community/explorer.git": null,
		});

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates(
			[PLUGIN_EXPLORER],
			LOCK_FILE,
		);

		assert.strictEqual(results[0].hasUpdate, false);
		assert.ok(results[0].error?.includes("Could not reach remote"));
	});

	it("checks all plugins in parallel", async () => {
		let callCount = 0;

		RepositoryConnection.fetchRemoteHeadCommit = async (): Promise<
			string | null
		> => {
			callCount++;

			return "newcommit000000000000000000000000000000000";
		};

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates(
			[PLUGIN_EXPLORER, PLUGIN_SEARCH],
			LOCK_FILE,
		);

		assert.strictEqual(callCount, 2);
		assert.strictEqual(results.length, 2);
		assert.ok(results.every((r) => r.hasUpdate));
	});

	it("handles null lock file", async () => {
		mockFetchRemoteHeadCommit({});

		const checker = new QuartzPluginUpdateChecker({ type: "none" });

		const results = await checker.checkUpdates([PLUGIN_EXPLORER], null);

		assert.strictEqual(results[0].hasUpdate, false);
		assert.strictEqual(results[0].lockedCommit, null);
	});
});
