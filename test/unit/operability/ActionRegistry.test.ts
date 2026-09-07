import { ActionRegistry } from "src/operability/ActionRegistry";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";
import type { Action } from "src/operability/types";
import type { PublicationService } from "src/services/PublicationService";
import type { OnboardingService } from "src/services/OnboardingService";
import type { PublicationCenterManager } from "src/operability/PublicationCenterManager";
import type { QuartzHubManager } from "src/operability/QuartzHubManager";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { PublishStatus } from "src/publisher/types";
import type { GitRunner } from "src/process/runners/GitRunner";
import type { NpmRunner } from "src/process/runners/NpmRunner";
import { setPlatform } from "../__mocks__/obsidian";
import { it } from "vitest";

type PluginManager = {
	disablePlugin?: (id: string) => Promise<void>;
	enablePlugin?: (id: string) => Promise<void>;
	disablePluginAndSave?: (id: string) => Promise<void>;
	enablePluginAndSave?: (id: string) => Promise<void>;
};

function makeStatus(): PublishStatus {
	return {
		unpublished: [],
		changed: [],
		published: [],
		deleted: [],
		media: [],
		arbitrary: [],
	};
}

function makePendingStatus(): PublishStatus {
	// The registry forwards these file objects; it does not compile them.
	const file = (path: string) =>
		({ file: { path } }) as unknown as PublishFile;
	return {
		unpublished: [file("New.md")],
		changed: [file("Changed.md"), file("Also changed.md")],
		published: [file("Synced.md")],
		deleted: ["Removed.md"],
		media: [
			{
				repoPath: "image.png",
				vaultPath: "image.png",
				sha: "abc",
				linked: true,
			},
		],
		arbitrary: [
			{
				repoPath: "custom.css",
				vaultPath: "custom.css",
				status: "changed",
			},
		],
	};
}

function makePlugin(
	overrides: Partial<{
		status: PublishStatus | null;
		stale: boolean;
		app: {
			plugins?: PluginManager;
			emulateMobile?: (enabled: boolean) => void;
		};
		gitRunner: Pick<GitRunner, "clone"> | null;
		npmRunner: Pick<NpmRunner, "install"> | null;
	}> = {},
): QuartzSyncer {
	return {
		settings: { ...DEFAULT_SETTINGS, gitRemoteUrl: "", quartzRepoPath: "" },
		manifest: { version: "2.0.0", id: "quartz-syncer" },
		app: overrides.app ?? {},
		gitRunner: overrides.gitRunner ?? null,
		npmRunner: overrides.npmRunner ?? null,
		saveSettings: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		statusCache: {
			getCachedStatusEvenIfStale: vi.fn(() => overrides.status ?? null),
			isStale: vi.fn(() => overrides.stale ?? true),
			setStatus: vi.fn(),
		},
	} as unknown as QuartzSyncer;
}

function makeFixture(plugin = makePlugin({ status: makePendingStatus() })) {
	const service = {
		getStatus: vi
			.fn<PublicationService["getStatus"]>()
			.mockResolvedValue(makeStatus()),
		publish: vi.fn<PublicationService["publish"]>().mockResolvedValue({
			success: true,
			filesPublished: 3,
			filesDeleted: 0,
		}),
		delete: vi.fn<PublicationService["delete"]>().mockResolvedValue({
			success: true,
			filesPublished: 0,
			filesDeleted: 1,
		}),
	};
	const controller = {
		getSelected: vi.fn(() => ["Keep.md", "Remove.md"]),
		setSelected: vi.fn<(paths: string[]) => void>(),
		selectAll: vi.fn(),
		deselectAll: vi.fn(),
	};
	// Only injected fakes can open here: no real modal or controller is constructed.
	const center = {
		getController: vi.fn((): typeof controller | null => controller),
		open: vi.fn(() => controller),
		close: vi.fn(),
	};
	const hub = { open: vi.fn(), close: vi.fn() };
	const getPublicationService = vi.fn(
		(): PublicationService | null =>
			service as unknown as PublicationService,
	);
	const getOnboardingService = vi.fn((): OnboardingService | null => null);
	const getPublicationCenterManager = vi.fn(
		(): PublicationCenterManager | null =>
			center as unknown as PublicationCenterManager,
	);
	const getQuartzHubManager = vi.fn(
		(): QuartzHubManager | null => hub as unknown as QuartzHubManager,
	);
	const registry = new ActionRegistry(
		plugin,
		getPublicationService,
		getOnboardingService,
		getPublicationCenterManager,
		getQuartzHubManager,
	);
	return {
		registry,
		plugin,
		service,
		controller,
		center,
		hub,
		getPublicationService,
		getOnboardingService,
		getPublicationCenterManager,
		getQuartzHubManager,
	};
}

const lockedActions: Action[] = [
	{ name: "status.refresh" },
	{ name: "connection.test" },
	{ name: "settings.set", params: { key: "gitBranch", value: "blocked" } },
	{ name: "plugin.reload", params: { confirm: true } },
	{ name: "pub.publish", params: { confirm: true } },
	{ name: "pub.delete", params: { confirm: true } },
	{ name: "hub.setup.link", params: { path: "" } },
	{ name: "hub.setup.clone", params: { url: "", dest: "", confirm: true } },
];

const destructiveActions: Action[] = [
	{ name: "pub.publish", params: { confirm: true } },
	{ name: "pub.delete", params: { confirm: true } },
	{ name: "plugin.reload", params: { confirm: true } },
	{
		name: "hub.setup.clone",
		params: {
			url: "https://example.com/quartz.git",
			dest: "/tmp/quartz",
			confirm: true,
		},
	},
	{ name: "env.emulateMobile", params: { enabled: true, confirm: true } },
];

describe("ActionRegistry", () => {
	describe("dispatch()", () => {
		it("rejects an unknown action with a meaningful error", async () => {
			const { registry } = makeFixture();
			// Runtime callers can bypass the discriminated union.
			const result = await registry.dispatch({
				name: "unknown.action",
			} as unknown as Action);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown action");
		});
	});

	describe("operation lock", () => {
		it.each(lockedActions)(
			"blocks $name while held and releases afterwards",
			async (action) => {
				const { registry, plugin, service } = makeFixture();
				let release = () => {};
				const pending = new Promise<void>((resolve) => {
					release = resolve;
				});
				vi.mocked(plugin.saveSettings).mockImplementationOnce(
					() => pending,
				);
				const holding = registry.dispatch({
					name: "settings.set",
					params: { key: "gitBranch", value: "holding" },
				});
				try {
					expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
					const result = await registry.dispatch(action);
					expect(result.success).toBe(false);
					expect(result.error).toContain("Operation in progress");
					expect(service.getStatus).not.toHaveBeenCalled();
					expect(service.publish).not.toHaveBeenCalled();
					expect(service.delete).not.toHaveBeenCalled();
					expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
					expect(plugin.settings.gitBranch).toBe("holding");
				} finally {
					release();
					await holding;
				}
				const result = await registry.dispatch({
					name: "settings.set",
					params: { key: "gitBranch", value: "released" },
				});
				expect(result.success).toBe(true);
				expect(plugin.settings.gitBranch).toBe("released");
				expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
			},
		);

		it("releases after an operation rejects", async () => {
			const { registry, plugin, service } = makeFixture();
			vi.mocked(plugin.saveSettings).mockRejectedValueOnce(
				new Error("Save failed"),
			);
			await expect(
				registry.dispatch({
					name: "settings.set",
					params: { key: "gitBranch", value: "v5" },
				}),
			).rejects.toThrow("Save failed");
			const result = await registry.dispatch({ name: "status.refresh" });
			expect(result.success).toBe(true);
			expect(service.getStatus).toHaveBeenCalledTimes(1);
		});

		it("releases after an operation returns an error", async () => {
			const { registry, service } = makeFixture();
			service.getStatus.mockRejectedValueOnce(
				new Error("Refresh failed"),
			);
			const failed = await registry.dispatch({ name: "status.refresh" });
			expect(failed.success).toBe(false);
			expect(failed.error).toContain("Refresh failed");
			const retried = await registry.dispatch({ name: "status.refresh" });
			expect(retried.success).toBe(true);
			expect(service.getStatus).toHaveBeenCalledTimes(2);
		});
	});

	describe("confirmation gates", () => {
		it.each(destructiveActions)(
			"rejects $name without confirmation before side effects",
			async (action) => {
				const disablePlugin = vi.fn();
				const enablePlugin = vi.fn();
				const emulateMobile = vi.fn();
				const clone = vi.fn<GitRunner["clone"]>();
				const install = vi.fn<NpmRunner["install"]>();
				const { registry, service, plugin } = makeFixture(
					makePlugin({
						status: makePendingStatus(),
						app: {
							plugins: { disablePlugin, enablePlugin },
							emulateMobile,
						},
						gitRunner: { clone },
						npmRunner: { install },
					}),
				);
				const params = "params" in action ? { ...action.params } : {};
				Reflect.deleteProperty(params, "confirm");
				// Exercise untrusted runtime input, deliberately omitting required confirmation.
				const result = await registry.dispatch({
					name: action.name,
					params,
				} as unknown as Action);
				expect(result.success).toBe(false);
				expect(result.error).toContain(
					action.name === "env.emulateMobile"
						? "Destructive action requires confirm: true"
						: "Confirmation required",
				);
				expect(service.publish).not.toHaveBeenCalled();
				expect(service.delete).not.toHaveBeenCalled();
				expect(disablePlugin).not.toHaveBeenCalled();
				expect(enablePlugin).not.toHaveBeenCalled();
				expect(emulateMobile).not.toHaveBeenCalled();
				expect(clone).not.toHaveBeenCalled();
				expect(install).not.toHaveBeenCalled();
				expect(plugin.saveSettings).not.toHaveBeenCalled();
			},
		);
	});

	describe("publication", () => {
		it.each(["status.refresh", "pub.publish", "pub.delete"] as const)(
			"rejects %s when the publisher is unavailable",
			async (name) => {
				const { registry, getPublicationService } = makeFixture();
				getPublicationService.mockReturnValue(null);
				const result = await registry.dispatch({
					name,
					params: { confirm: true },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Publisher not available");
			},
		);

		it.each(["pub.publish", "pub.delete"] as const)(
			"rejects %s before status is loaded",
			async (name) => {
				const { registry, service } = makeFixture(makePlugin());
				const result = await registry.dispatch({
					name,
					params: { confirm: true },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain(
					"Publish status not loaded. Run status.refresh first.",
				);
				expect(service.publish).not.toHaveBeenCalled();
				expect(service.delete).not.toHaveBeenCalled();
			},
		);

		it.each(["pub.publish", "pub.delete"] as const)(
			"skips %s when there is no pending work",
			async (name) => {
				const { registry, service } = makeFixture(
					makePlugin({ status: makeStatus() }),
				);
				const result = await registry.dispatch({
					name,
					params: { confirm: true },
				});
				expect(result).toEqual({
					success: true,
					data: { filesPublished: 0, filesDeleted: 0 },
				});
				expect(service.publish).not.toHaveBeenCalled();
				expect(service.delete).not.toHaveBeenCalled();
			},
		);

		it("publishes only unpublished and changed files with the supplied message", async () => {
			const status = makePendingStatus();
			const { registry, service } = makeFixture(makePlugin({ status }));
			const result = await registry.dispatch({
				name: "pub.publish",
				params: { confirm: true, message: "Selected updates" },
			});
			expect(result.success).toBe(true);
			expect(result.data).toEqual({
				success: true,
				filesPublished: 3,
				filesDeleted: 0,
			});
			expect(service.publish).toHaveBeenCalledTimes(1);
			expect(service.publish).toHaveBeenCalledWith(
				[...status.unpublished, ...status.changed],
				"Selected updates",
			);
			expect(service.delete).not.toHaveBeenCalled();
		});

		it("deletes only cached deleted paths when confirmed", async () => {
			const { registry, service } = makeFixture();
			const result = await registry.dispatch({
				name: "pub.delete",
				params: { confirm: true },
			});
			expect(result.success).toBe(true);
			expect(result.data).toEqual({
				success: true,
				filesPublished: 0,
				filesDeleted: 1,
			});
			expect(service.delete).toHaveBeenCalledTimes(1);
			expect(service.delete).toHaveBeenCalledWith(["Removed.md"]);
			expect(service.publish).not.toHaveBeenCalled();
		});

		it.each([
			{
				name: "pub.publish",
				method: "publish",
				fallback: "Publish failed",
			},
			{ name: "pub.delete", method: "delete", fallback: "Delete failed" },
		] as const)(
			"propagates $name failures and supplies a fallback error",
			async ({ name, method, fallback }) => {
				const { registry, service } = makeFixture();
				const failed = {
					success: false,
					filesPublished: 0,
					filesDeleted: 0,
					error: "Permission denied",
				};
				service[method]
					.mockResolvedValueOnce(failed)
					.mockResolvedValueOnce({ ...failed, error: undefined });
				const result = await registry.dispatch({
					name,
					params: { confirm: true },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Permission denied");
				expect(result.data).toEqual(failed);
				const withoutMessage = await registry.dispatch({
					name,
					params: { confirm: true },
				});
				expect(withoutMessage.success).toBe(false);
				expect(withoutMessage.error).toContain(fallback);
			},
		);

		it.each([
			{ name: "status.refresh", method: "getStatus" },
			{ name: "pub.publish", method: "publish" },
			{ name: "pub.delete", method: "delete" },
		] as const)(
			"converts thrown errors from $name into failed results",
			async ({ name, method }) => {
				const { registry, service, plugin } = makeFixture();
				for (const error of [
					new Error("Request failed"),
					"Request failed",
				]) {
					service[method].mockRejectedValueOnce(error);
					const result = await registry.dispatch({
						name,
						params: { confirm: true },
					});
					expect(result.success).toBe(false);
					expect(result.error).toContain("Request failed");
				}
				expect(plugin.statusCache.setStatus).not.toHaveBeenCalled();
			},
		);
	});

	describe("status cache", () => {
		it("returns null when no status has been cached", () => {
			const { registry } = makeFixture(makePlugin());
			expect(registry.getCachedStatus()).toBeNull();
			expect(registry.getPublishStatusSummary()).toBeNull();
		});

		it.each([true, false])(
			"summarizes all categories with stale=%s",
			(stale) => {
				const status = makePendingStatus();
				const { registry, service } = makeFixture(
					makePlugin({ status, stale }),
				);
				expect(registry.getCachedStatus()).toBe(status);
				expect(registry.getPublishStatusSummary()).toEqual({
					unpublished: 1,
					changed: 2,
					published: 1,
					deleted: 1,
					media: 1,
					arbitrary: 1,
					stale,
				});
				expect(service.getStatus).not.toHaveBeenCalled();
			},
		);

		it("refreshes and caches the exact service status", async () => {
			const { registry, service, plugin } = makeFixture();
			const status = makePendingStatus();
			service.getStatus.mockResolvedValue(status);
			const result = await registry.dispatch({ name: "status.refresh" });
			expect(result.success).toBe(true);
			expect(result.data).toBe(status);
			expect(service.getStatus).toHaveBeenCalledTimes(1);
			expect(plugin.statusCache.setStatus).toHaveBeenCalledTimes(1);
			expect(plugin.statusCache.setStatus).toHaveBeenCalledWith(status);
		});
	});

	describe("manager availability", () => {
		const actions: Action[] = [
			{ name: "pub.open" },
			{ name: "pub.close" },
			{ name: "pub.select", params: { paths: ["Note.md"] } },
			{ name: "pub.deselect", params: { paths: ["Note.md"] } },
			{ name: "pub.selectAll" },
			{ name: "pub.deselectAll" },
			{ name: "hub.open" },
			{ name: "hub.close" },
		];
		it.each(actions)(
			"rejects $name when its manager is unavailable",
			async (action) => {
				const {
					registry,
					getPublicationCenterManager,
					getQuartzHubManager,
					center,
					hub,
				} = makeFixture();
				getPublicationCenterManager.mockReturnValue(null);
				getQuartzHubManager.mockReturnValue(null);
				const result = await registry.dispatch(action);
				expect(result.success).toBe(false);
				expect(result.error).toContain(
					action.name.startsWith("pub.")
						? "Publication Center unavailable"
						: "Quartz Hub unavailable",
				);
				expect(center.open).not.toHaveBeenCalled();
				expect(hub.open).not.toHaveBeenCalled();
			},
		);

		it.each([
			{ name: "pub.open", manager: "center", method: "open" },
			{ name: "pub.close", manager: "center", method: "close" },
			{ name: "hub.open", manager: "hub", method: "open" },
			{ name: "hub.close", manager: "hub", method: "close" },
		] as const)(
			"routes $name to the injected manager",
			async ({ name, manager, method }) => {
				const fixture = makeFixture();
				const result = await fixture.registry.dispatch({ name });
				expect(result.success).toBe(true);
				expect(fixture[manager][method]).toHaveBeenCalledTimes(1);
			},
		);

		it("selects paths through the injected controller without opening a modal", async () => {
			const { registry, controller, center } = makeFixture();
			const result = await registry.dispatch({
				name: "pub.select",
				params: { paths: ["Note.md"] },
			});
			expect(result.success).toBe(true);
			expect(controller.setSelected).toHaveBeenCalledTimes(1);
			expect(controller.setSelected).toHaveBeenCalledWith(["Note.md"]);
			expect(center.open).not.toHaveBeenCalled();
		});

		it("deselects only requested paths using the fake manager open fallback", async () => {
			const { registry, controller, center } = makeFixture();
			center.getController.mockReturnValue(null);
			const result = await registry.dispatch({
				name: "pub.deselect",
				params: { paths: ["Remove.md", "Absent.md"] },
			});
			expect(result.success).toBe(true);
			expect(center.open).toHaveBeenCalledTimes(1);
			expect(controller.setSelected).toHaveBeenCalledTimes(1);
			expect(controller.setSelected).toHaveBeenCalledWith(["Keep.md"]);
		});

		it.each([
			{ name: "pub.selectAll", method: "selectAll" },
			{ name: "pub.deselectAll", method: "deselectAll" },
		] as const)(
			"routes $name to the matching controller method",
			async ({ name, method }) => {
				const { registry, controller, center } = makeFixture();
				const result = await registry.dispatch({ name });
				expect(result.success).toBe(true);
				expect(controller[method]).toHaveBeenCalledTimes(1);
				expect(center.open).not.toHaveBeenCalled();
			},
		);
	});

	describe("plugin.reload", () => {
		it("refuses reload on mobile even when confirmed", async () => {
			setPlatform({ isDesktopApp: false, isMobileApp: true });
			const disablePlugin = vi.fn();
			const enablePlugin = vi.fn();
			const { registry } = makeFixture(
				makePlugin({
					app: { plugins: { disablePlugin, enablePlugin } },
				}),
			);
			const result = await registry.dispatch({
				name: "plugin.reload",
				params: { confirm: true },
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Plugin reload is only available on desktop",
			);
			expect(disablePlugin).not.toHaveBeenCalled();
			expect(enablePlugin).not.toHaveBeenCalled();
		});

		it.each(["manager", "disable", "enable"])(
			"refuses reload without %s support",
			async (missing) => {
				const disablePlugin = vi.fn();
				const enablePlugin = vi.fn();
				const plugins =
					missing === "manager"
						? undefined
						: {
								disablePlugin:
									missing === "disable"
										? undefined
										: disablePlugin,
								enablePlugin:
									missing === "enable"
										? undefined
										: enablePlugin,
							};
				const { registry } = makeFixture(
					makePlugin({ app: { plugins } }),
				);
				const result = await registry.dispatch({
					name: "plugin.reload",
					params: { confirm: true },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain(
					"Plugin manager does not support reload",
				);
				expect(disablePlugin).not.toHaveBeenCalled();
				expect(enablePlugin).not.toHaveBeenCalled();
			},
		);

		it.each([true, false])(
			"reloads in order and prefers saving methods when available=%s",
			async (saving) => {
				const calls: string[] = [];
				const disable = vi.fn(async () => {
					expect(Reflect.get(window, "__QS_RELOADING__")).toBe(true);
					calls.push("disable");
				});
				const enable = vi.fn(async () => {
					calls.push("enable");
				});
				const fallbackDisable = vi.fn();
				const fallbackEnable = vi.fn();
				const plugins = saving
					? {
							disablePluginAndSave: disable,
							enablePluginAndSave: enable,
							disablePlugin: fallbackDisable,
							enablePlugin: fallbackEnable,
						}
					: { disablePlugin: disable, enablePlugin: enable };
				const { registry } = makeFixture(
					makePlugin({ app: { plugins } }),
				);
				const result = await registry.dispatch({
					name: "plugin.reload",
					params: { confirm: true },
				});
				expect(result.success).toBe(true);
				expect(calls).toEqual(["disable", "enable"]);
				expect(disable).toHaveBeenCalledTimes(1);
				expect(disable).toHaveBeenCalledWith("quartz-syncer");
				expect(enable).toHaveBeenCalledTimes(1);
				expect(enable).toHaveBeenCalledWith("quartz-syncer");
				expect(fallbackDisable).not.toHaveBeenCalled();
				expect(fallbackEnable).not.toHaveBeenCalled();
				expect(Reflect.get(window, "__QS_RELOADING__")).toBe(false);
			},
		);

		it.each(["disable", "enable"] as const)(
			"clears the reload flag when %s fails",
			async (phase) => {
				const disablePlugin = vi
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined);
				const enablePlugin = vi
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined);
				(phase === "disable"
					? disablePlugin
					: enablePlugin
				).mockRejectedValueOnce(new Error("Reload failed"));
				const { registry } = makeFixture(
					makePlugin({
						app: { plugins: { disablePlugin, enablePlugin } },
					}),
				);
				const result = await registry.dispatch({
					name: "plugin.reload",
					params: { confirm: true },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Reload failed");
				expect(enablePlugin).toHaveBeenCalledTimes(
					phase === "disable" ? 0 : 1,
				);
				expect(Reflect.get(window, "__QS_RELOADING__")).toBe(false);
			},
		);
	});

	describe("hub.setup.clone", () => {
		const action: Action = {
			name: "hub.setup.clone",
			params: {
				url: "https://example.com/quartz.git",
				dest: "/tmp/quartz",
				confirm: true,
			},
		};

		it.each(["url", "dest"] as const)(
			"rejects a missing %s before calling a runner",
			async (missing) => {
				const clone = vi.fn<GitRunner["clone"]>();
				const { registry } = makeFixture(
					makePlugin({ gitRunner: { clone } }),
				);
				const result = await registry.dispatch({
					...action,
					params: { ...action.params, [missing]: "" },
				});
				expect(result.success).toBe(false);
				expect(result.error).toContain(
					"URL and destination path are required",
				);
				expect(clone).not.toHaveBeenCalled();
			},
		);

		it.each(["Git", "Npm"])(
			"rejects an unavailable %s runner",
			async (missing) => {
				const clone = vi.fn<GitRunner["clone"]>();
				const { registry } = makeFixture(
					makePlugin({
						gitRunner: missing === "Git" ? null : { clone },
					}),
				);
				const result = await registry.dispatch(action);
				expect(result.success).toBe(false);
				expect(result.error).toContain(`${missing} runner unavailable`);
				expect(clone).not.toHaveBeenCalled();
			},
		);

		it.each(["clone", "install", "success"] as const)(
			"handles the %s outcome without persisting an incomplete setup",
			async (outcome) => {
				const processResult = {
					exitCode: 0,
					stdout: "",
					stderr: "",
					killed: false,
				};
				const success = { ok: true as const, data: {}, processResult };
				const clone = vi
					.fn<GitRunner["clone"]>()
					.mockResolvedValue(
						outcome === "clone"
							? { ok: false, error: "Remote denied" }
							: success,
					);
				const install = vi
					.fn<NpmRunner["install"]>()
					.mockResolvedValue(
						outcome === "install"
							? { ok: false, error: "Dependency failed" }
							: success,
					);
				const { registry, plugin } = makeFixture(
					makePlugin({
						gitRunner: { clone },
						npmRunner: { install },
					}),
				);
				plugin.settings.enableSystemCommands = false;
				const result = await registry.dispatch(action);
				expect(clone).toHaveBeenCalledTimes(1);
				expect(clone).toHaveBeenCalledWith(
					"https://example.com/quartz.git",
					"quartz",
					{ cwd: "/tmp" },
				);
				if (outcome === "clone") {
					expect(install).not.toHaveBeenCalled();
				} else {
					expect(install).toHaveBeenCalledTimes(1);
					expect(install).toHaveBeenCalledWith({
						cwd: "/tmp/quartz",
					});
				}
				if (outcome === "success") {
					expect(result).toEqual({
						success: true,
						data: { path: "/tmp/quartz" },
					});
					expect(plugin.settings.quartzRepoPath).toBe("/tmp/quartz");
					expect(plugin.settings.enableSystemCommands).toBe(true);
					expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
				} else {
					expect(result.success).toBe(false);
					expect(result.error).toContain(
						outcome === "clone"
							? "Clone failed: Remote denied"
							: "npm install failed: Dependency failed",
					);
					expect(plugin.settings.quartzRepoPath).toBe("");
					expect(plugin.settings.enableSystemCommands).toBe(false);
					expect(plugin.saveSettings).not.toHaveBeenCalled();
				}
			},
		);
	});

	describe("settings and environment", () => {
		it("returns an error for an unknown setting", async () => {
			const { registry } = makeFixture();
			const result = await registry.dispatch({
				name: "settings.get",
				params: { key: "missing.setting" },
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Setting not found: missing.setting",
			);
		});

		it("persists a setting and reads back its concrete value", async () => {
			const { registry, plugin } = makeFixture();
			const params = { key: "gitBranch", value: "test-branch" };
			expect(
				await registry.dispatch({ name: "settings.set", params }),
			).toEqual({ success: true, data: params });
			expect(plugin.settings.gitBranch).toBe("test-branch");
			expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
			expect(
				await registry.dispatch({
					name: "settings.get",
					params: { key: params.key },
				}),
			).toEqual({ success: true, data: params });
		});

		it("refuses mobile emulation when the app does not support it", async () => {
			const { registry } = makeFixture();
			const result = await registry.dispatch({
				name: "env.emulateMobile",
				params: { enabled: true, confirm: true },
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"emulateMobile not available in this Obsidian version",
			);
		});

		it.each([true, false])(
			"forwards confirmed mobile emulation enabled=%s",
			async (enabled) => {
				const emulateMobile = vi.fn();
				const { registry } = makeFixture(
					makePlugin({ app: { emulateMobile } }),
				);
				const result = await registry.dispatch({
					name: "env.emulateMobile",
					params: { enabled, confirm: true },
				});
				expect(result).toEqual({
					success: true,
					data: { mobileEmulation: enabled },
				});
				expect(emulateMobile).toHaveBeenCalledTimes(1);
				expect(emulateMobile).toHaveBeenCalledWith(enabled);
			},
		);
	});
});
