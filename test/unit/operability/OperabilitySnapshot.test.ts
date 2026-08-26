import { assembleSnapshot } from "src/operability/OperabilitySnapshot";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";

function makePlugin(
	overrides: Partial<{
		gitRemoteUrl: string;
		quartzRepoPath: string;
		cache: string;
		cacheTimestamp: number;
		hasToken: boolean;
		engineRunning: boolean;
		enginePending: number;
		engineAutoPublish: boolean;
		statusBarState: "ready" | "compiling" | "error" | "unconfigured";
	}> = {},
): QuartzSyncer {
	return {
		settings: {
			...DEFAULT_SETTINGS,
			gitRemoteUrl: overrides.gitRemoteUrl ?? "",
			quartzRepoPath: overrides.quartzRepoPath ?? "",
			cache: overrides.cache ?? "{}",
			cacheTimestamp: overrides.cacheTimestamp ?? 0,
		},
		appVersion: "2.0.0",
		manifest: { version: "2.0.0", id: "quartz-syncer" },
		app: {},
		secretStorageService: {
			hasToken: () => overrides.hasToken ?? false,
		},
		getBackgroundEngine: () =>
			overrides.engineRunning !== undefined
				? {
						isRunning: overrides.engineRunning,
						pendingCount: overrides.enginePending ?? 0,
						isAutoPublishActive:
							overrides.engineAutoPublish ?? false,
						isAutoPublishPaused: false,
						queuedPaths: [],
					}
				: null,
		getStatusBar: () =>
			overrides.statusBarState
				? { currentState: overrides.statusBarState }
				: null,
		getEngineStatus: () => ({
			running: overrides.engineRunning ?? false,
			pending: overrides.enginePending ?? 0,
			autoPublish: overrides.engineAutoPublish ?? false,
		}),
	} as unknown as QuartzSyncer;
}

describe("assembleSnapshot", () => {
	it("contractVersion is 1", () => {
		const snapshot = assembleSnapshot(makePlugin());
		expect(snapshot.contractVersion).toBe(1);
	});

	it("returns a timestamp close to now", () => {
		const before = Date.now();
		const snapshot = assembleSnapshot(makePlugin());
		expect(snapshot.timestamp).toBeGreaterThanOrEqual(before);
		expect(snapshot.timestamp).toBeLessThanOrEqual(Date.now());
	});

	describe("settings.configured", () => {
		it("is true when gitRemoteUrl is set", () => {
			const snapshot = assembleSnapshot(
				makePlugin({
					gitRemoteUrl: "https://github.com/user/repo.git",
				}),
			);
			expect(snapshot.settings.configured).toBe(true);
		});

		it("is true when quartzRepoPath is set", () => {
			const snapshot = assembleSnapshot(
				makePlugin({ quartzRepoPath: "/home/user/quartz" }),
			);
			expect(snapshot.settings.configured).toBe(true);
		});

		it("is false when both gitRemoteUrl and quartzRepoPath are empty", () => {
			const snapshot = assembleSnapshot(makePlugin());
			expect(snapshot.settings.configured).toBe(false);
		});
	});

	describe("engine fields", () => {
		it("reflects background engine state when available", () => {
			const snapshot = assembleSnapshot(
				makePlugin({
					engineRunning: true,
					enginePending: 3,
					engineAutoPublish: true,
				}),
			);
			expect(snapshot.engine.running).toBe(true);
			expect(snapshot.engine.pending).toBe(3);
			expect(snapshot.engine.autoPublish).toBe(true);
		});

		it("defaults to safe values when no engine", () => {
			const plugin = makePlugin();
			(
				plugin as unknown as { getBackgroundEngine: () => null }
			).getBackgroundEngine = () => null;
			const snapshot = assembleSnapshot(plugin);
			expect(snapshot.engine.running).toBe(false);
			expect(snapshot.engine.pending).toBe(0);
			expect(snapshot.engine.autoPublish).toBe(false);
		});
	});

	describe("security: no secrets in snapshot", () => {
		it("does not contain gitRemoteUrl value", () => {
			const plugin = makePlugin({
				gitRemoteUrl: "https://github.com/user/repo.git",
				hasToken: true,
			});
			const snapshot = assembleSnapshot(plugin);
			const serialized = JSON.stringify(snapshot);
			expect(serialized).not.toContain(
				"https://github.com/user/repo.git",
			);
		});

		it("settings.hasToken is a boolean, not a token string", () => {
			const snapshot = assembleSnapshot(makePlugin({ hasToken: true }));
			expect(typeof snapshot.settings.hasToken).toBe("boolean");
		});
	});

	it("publishStatus is null by default", () => {
		const snapshot = assembleSnapshot(makePlugin());
		expect(snapshot.publishStatus).toBeNull();
	});

	describe("cache", () => {
		it("fileCount counts file: prefixed keys", () => {
			const cache = JSON.stringify({
				"file:a.md": { hash: "abc" },
				"file:b.md": { hash: "def" },
				meta: "ignored",
			});
			const snapshot = assembleSnapshot(makePlugin({ cache }));
			expect(snapshot.cache.fileCount).toBe(2);
		});

		it("lastUpdate is null when cacheTimestamp is 0", () => {
			const snapshot = assembleSnapshot(
				makePlugin({ cacheTimestamp: 0 }),
			);
			expect(snapshot.cache.lastUpdate).toBeNull();
		});

		it("lastUpdate reflects cacheTimestamp when > 0", () => {
			const snapshot = assembleSnapshot(
				makePlugin({ cacheTimestamp: 1700000000 }),
			);
			expect(snapshot.cache.lastUpdate).toBe(1700000000);
		});
	});

	describe("statusBar", () => {
		it("reflects statusBar currentState when available", () => {
			const snapshot = assembleSnapshot(
				makePlugin({ statusBarState: "ready" }),
			);
			expect(snapshot.statusBar.state).toBe("ready");
		});

		it("defaults to unconfigured when no status bar", () => {
			const plugin = makePlugin();
			(plugin as unknown as { getStatusBar: () => null }).getStatusBar =
				() => null;
			const snapshot = assembleSnapshot(plugin);
			expect(snapshot.statusBar.state).toBe("unconfigured");
		});
	});

	it("plugin.loaded is true when app exists", () => {
		const snapshot = assembleSnapshot(makePlugin());
		expect(snapshot.plugin.loaded).toBe(true);
	});

	it("plugin.version comes from appVersion", () => {
		const snapshot = assembleSnapshot(makePlugin());
		expect(snapshot.plugin.version).toBe("2.0.0");
	});
});
