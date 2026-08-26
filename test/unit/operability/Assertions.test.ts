import { runAssertion } from "src/operability/Assertions";
import { EventBuffer } from "src/operability/EventBuffer";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";

function makePlugin(
	overrides: Partial<{
		hasApp: boolean;
		hasDataStore: boolean;
		gitRemoteUrl: string;
		quartzRepoPath: string;
		gitBranch: string;
		gitAuthType: string;
		hasToken: boolean;
		enginePending: number;
		engineRunning: boolean;
		engineAutoPublish: boolean;
	}> = {},
): QuartzSyncer {
	return {
		app: overrides.hasApp !== false ? {} : null,
		settings: {
			...DEFAULT_SETTINGS,
			gitRemoteUrl: overrides.gitRemoteUrl ?? "",
			quartzRepoPath: overrides.quartzRepoPath ?? "",
			gitBranch: overrides.gitBranch ?? "v5",
			gitAuthType: overrides.gitAuthType ?? "basic",
		},
		dataStore:
			overrides.hasDataStore !== false
				? { allKeys: () => Promise.resolve([]) }
				: null,
		secretStorageService: {
			hasToken: () => overrides.hasToken ?? false,
		},
		getEngineStatus: () => ({
			running: overrides.engineRunning ?? false,
			pending: overrides.enginePending ?? 0,
			autoPublish: overrides.engineAutoPublish ?? false,
		}),
	} as unknown as QuartzSyncer;
}

describe("Assertions", () => {
	describe("health.core", () => {
		it("passes when plugin is loaded with dataStore and no errors", () => {
			const plugin = makePlugin({ hasApp: true, hasDataStore: true });
			const buf = new EventBuffer();
			const result = runAssertion("health.core", undefined, plugin, buf);
			expect(result.pass).toBe(true);
			expect(result.details.loaded).toBe(true);
			expect(result.details.dataStore).toBe(true);
		});

		it("fails when dataStore is missing", () => {
			const plugin = makePlugin({ hasApp: true, hasDataStore: false });
			const buf = new EventBuffer();
			const result = runAssertion("health.core", undefined, plugin, buf);
			expect(result.pass).toBe(false);
			expect(result.details.dataStore).toBe(false);
		});

		it("fails when app is missing", () => {
			const plugin = makePlugin({ hasApp: false, hasDataStore: true });
			const buf = new EventBuffer();
			const result = runAssertion("health.core", undefined, plugin, buf);
			expect(result.pass).toBe(false);
			expect(result.details.loaded).toBe(false);
		});

		it("fails when event buffer has error.occurred events", () => {
			const plugin = makePlugin({ hasApp: true, hasDataStore: true });
			const buf = new EventBuffer();
			buf.emit("error.occurred", { message: "something broke" });
			const result = runAssertion("health.core", undefined, plugin, buf);
			expect(result.pass).toBe(false);
			const errors = result.details.errors as { count: number };
			expect(errors.count).toBeGreaterThan(0);
		});
	});

	describe("health.configured", () => {
		it("passes when gitRemoteUrl is set with branch and token", () => {
			const plugin = makePlugin({
				gitRemoteUrl: "https://github.com/user/repo.git",
				gitBranch: "v5",
				hasToken: true,
			});
			const buf = new EventBuffer();
			const result = runAssertion(
				"health.configured",
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(true);
			expect(result.details.configured).toBe(true);
			expect(result.details.hasToken).toBe(true);
		});

		it("fails when gitRemoteUrl is empty and no quartzRepoPath", () => {
			const plugin = makePlugin({
				gitRemoteUrl: "",
				quartzRepoPath: "",
			});
			const buf = new EventBuffer();
			const result = runAssertion(
				"health.configured",
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(false);
			expect(result.details.configured).toBe(false);
		});

		it("fails when gitRemoteUrl is set but no token for basic auth", () => {
			const plugin = makePlugin({
				gitRemoteUrl: "https://github.com/user/repo.git",
				gitAuthType: "basic",
				hasToken: false,
			});
			const buf = new EventBuffer();
			const result = runAssertion(
				"health.configured",
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(false);
			expect(result.details.hasToken).toBe(false);
		});
	});

	describe("engine.idle", () => {
		it("passes when pendingCount is 0", () => {
			const plugin = makePlugin({ enginePending: 0 });
			const buf = new EventBuffer();
			const result = runAssertion("engine.idle", undefined, plugin, buf);
			expect(result.pass).toBe(true);
			expect(result.details.pending).toBe(0);
		});

		it("fails when pendingCount > 0", () => {
			const plugin = makePlugin({ enginePending: 5 });
			const buf = new EventBuffer();
			const result = runAssertion("engine.idle", undefined, plugin, buf);
			expect(result.pass).toBe(false);
			expect(result.details.pending).toBe(5);
		});
	});

	describe("engine.running", () => {
		it("passes when engine is running", () => {
			const plugin = makePlugin({ engineRunning: true });
			const buf = new EventBuffer();
			const result = runAssertion(
				"engine.running",
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(true);
		});

		it("fails when engine is not running", () => {
			const plugin = makePlugin({ engineRunning: false });
			const buf = new EventBuffer();
			const result = runAssertion(
				"engine.running",
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(false);
		});
	});

	describe("errors.none", () => {
		it("passes with empty event buffer", () => {
			const plugin = makePlugin();
			const buf = new EventBuffer();
			const result = runAssertion("errors.none", undefined, plugin, buf);
			expect(result.pass).toBe(true);
			expect(result.details.count).toBe(0);
		});

		it("passes when buffer has non-error events", () => {
			const plugin = makePlugin();
			const buf = new EventBuffer();
			buf.emit("plugin.loaded", { version: "1.0" });
			buf.emit("status.refreshed", { summary: {} });
			const result = runAssertion("errors.none", undefined, plugin, buf);
			expect(result.pass).toBe(true);
			expect(result.details.count).toBe(0);
		});

		it("fails when event buffer has error.occurred events", () => {
			const plugin = makePlugin();
			const buf = new EventBuffer();
			buf.emit("error.occurred", { message: "connection failed" });
			const result = runAssertion("errors.none", undefined, plugin, buf);
			expect(result.pass).toBe(false);
			expect(result.details.count).toBe(1);
		});

		it("respects cursor param to only check errors after cursor", () => {
			const plugin = makePlugin();
			const buf = new EventBuffer();
			buf.emit("error.occurred", { message: "old error" });
			const cursorAfterFirst = buf.newestCursor!;
			buf.emit("plugin.loaded", { version: "1.0" });
			const result = runAssertion(
				"errors.none",
				{ cursor: cursorAfterFirst },
				plugin,
				buf,
			);
			expect(result.pass).toBe(true);
		});
	});

	describe("unknown check", () => {
		it("returns pass: false for unknown check names", () => {
			const plugin = makePlugin();
			const buf = new EventBuffer();
			const result = runAssertion(
				"nonexistent.check" as Parameters<typeof runAssertion>[0],
				undefined,
				plugin,
				buf,
			);
			expect(result.pass).toBe(false);
			expect(result.details.reason).toBe("Unknown check");
		});
	});
});
