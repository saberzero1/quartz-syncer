import { OperabilityFacadeImpl } from "src/operability/OperabilityFacade";
import { EventBuffer } from "src/operability/EventBuffer";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";
import type { Action } from "src/operability/types";

vi.mock("src/services/PublicationService", () => ({
	PublicationService: vi.fn(),
}));

vi.mock("src/services/OnboardingService", () => ({
	OnboardingService: vi.fn(),
}));

function makePlugin(
	overrides: Partial<{
		gitRemoteUrl: string;
		hasToken: boolean;
		enginePending: number;
	}> = {},
): QuartzSyncer {
	return {
		settings: {
			...DEFAULT_SETTINGS,
			gitRemoteUrl: overrides.gitRemoteUrl ?? "",
			cache: "{}",
			cacheTimestamp: 0,
		},
		appVersion: "2.0.0",
		manifest: { version: "2.0.0", id: "quartz-syncer" },
		app: {},
		dataStore: { allKeys: () => Promise.resolve([]) },
		secretStorageService: {
			hasToken: () => overrides.hasToken ?? false,
		},
		getPublisher: () => null,
		getBackgroundEngine: () => null,
		getStatusBar: () => null,
		getEngineStatus: () => ({
			running: false,
			pending: overrides.enginePending ?? 0,
			autoPublish: false,
		}),
		saveSettings: vi.fn(),
		loadSettings: vi.fn(),
		statusCache: {
			getCachedStatusEvenIfStale: () => null,
			isStale: () => true,
			invalidate: vi.fn(),
			markStale: vi.fn(),
			clearDiffCache: vi.fn(),
		},
	} as unknown as QuartzSyncer;
}

describe("OperabilityFacadeImpl", () => {
	describe("snapshot()", () => {
		it("returns a valid OperabilitySnapshot", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const snap = facade.snapshot();
			expect(snap.contractVersion).toBe(1);
			expect(typeof snap.timestamp).toBe("number");
			expect(snap.plugin.version).toBe("2.0.0");
			expect(snap.plugin.loaded).toBe(true);
		});

		it("publishStatus is null when no status refresh has occurred", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const snap = facade.snapshot();
			expect(snap.publishStatus).toBeNull();
		});

		it("errors.count is 0 on fresh facade", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const snap = facade.snapshot();
			expect(snap.errors.count).toBe(0);
			expect(snap.errors.latest).toBeNull();
		});
	});

	describe("assert()", () => {
		it("returns a CheckResult for health.core", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const result = facade.assert("health.core");
			expect(typeof result.pass).toBe("boolean");
			expect(result.details).toMatchObject({
				loaded: true,
				dataStore: true,
				errors: { count: 0, latest: null },
			});
		});

		it("health.core passes with loaded plugin and dataStore", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const result = facade.assert("health.core");
			expect(result.pass).toBe(true);
		});

		it("engine.idle passes when pending is 0", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin({ enginePending: 0 }),
				new EventBuffer(),
			);
			const result = facade.assert("engine.idle");
			expect(result.pass).toBe(true);
		});

		it("engine.idle fails when pending > 0", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin({ enginePending: 3 }),
				new EventBuffer(),
			);
			const result = facade.assert("engine.idle");
			expect(result.pass).toBe(false);
		});
	});

	describe("act()", () => {
		it("act({name:'pub.delete'}) with no params resolves to a confirmation failure rather than throwing", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			await expect(
				facade.act({ name: "pub.delete" } as Action),
			).resolves.toEqual({
				success: false,
				error: "Confirmation required",
			});
		});

		it("validates pub.publish before its started event reads params.message", async () => {
			const events = new EventBuffer();
			const facade = new OperabilityFacadeImpl(makePlugin(), events);
			await expect(
				facade.act({ name: "pub.publish" } as Action),
			).resolves.toEqual({
				success: false,
				error: "Confirmation required",
			});
			expect(events.tail(10).map((event) => event.type)).toEqual([
				"plugin.loaded",
			]);
		});

		it.each([undefined, null, [], { name: 42 }])(
			"rejects malformed action envelopes without emitting action events: %j",
			async (action) => {
				const facade = new OperabilityFacadeImpl(
					makePlugin(),
					new EventBuffer(),
				);
				await expect(
					facade.act(action as unknown as Action),
				).resolves.toEqual({ success: false, error: "Unknown action" });
			},
		);

		it("keeps reloadSelf's internal dispatch confirmed and safe", async () => {
			const plugin = makePlugin();
			const disablePlugin = vi.fn().mockResolvedValue(undefined);
			const enablePlugin = vi.fn().mockResolvedValue(undefined);
			Object.assign(plugin.app, {
				plugins: { disablePlugin, enablePlugin },
			});
			const facade = new OperabilityFacadeImpl(plugin, new EventBuffer());
			await expect(facade.reloadSelf()).resolves.toEqual({
				success: true,
			});
			expect(disablePlugin).toHaveBeenCalledExactlyOnceWith(
				"quartz-syncer",
			);
			expect(enablePlugin).toHaveBeenCalledExactlyOnceWith(
				"quartz-syncer",
			);
		});

		it("returns error when shuttingDown", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			facade.shutdown();
			const result = await facade.act({ name: "status.refresh" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin is shutting down");
		});

		it("dispatches action when not shutting down", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const result = await facade.act({ name: "status.refresh" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Publisher not available");
		});
	});

	describe("events", () => {
		it("returns EventBufferReader interface with tail and since", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const reader = facade.events;
			expect(typeof reader.tail).toBe("function");
			expect(typeof reader.since).toBe("function");
		});

		it("has plugin.loaded event from constructor", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			const events = facade.events.tail(10);
			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events[0].type).toBe("plugin.loaded");
		});

		it("records error.occurred events from failed actions", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			await facade.act({ name: "status.refresh" });
			const events = facade.events.tail(10);
			const errors = events.filter((e) => e.type === "error.occurred");
			expect(errors.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("shutdown()", () => {
		it("sets shuttingDown flag so subsequent act() returns error", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			facade.shutdown();
			const result = await facade.act({ name: "connection.test" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin is shutting down");
		});

		it("emits plugin.unloading event", () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			facade.shutdown();
			const events = facade.events.tail(10);
			const unloading = events.find((e) => e.type === "plugin.unloading");
			expect(unloading).toEqual(
				expect.objectContaining({
					type: "plugin.unloading",
					payload: {},
					cursor: expect.any(Number),
					timestamp: expect.any(Number),
				}),
			);
		});

		it("reloadSelf() also returns error after shutdown", async () => {
			const facade = new OperabilityFacadeImpl(
				makePlugin(),
				new EventBuffer(),
			);
			facade.shutdown();
			const result = await facade.reloadSelf();
			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin is shutting down");
		});
	});
});
