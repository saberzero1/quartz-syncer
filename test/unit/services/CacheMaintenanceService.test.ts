import { beforeEach, describe, expect, it, vi } from "vitest";
import type QuartzSyncer from "src/main";
import { dropCaches, surveyForeignCaches } from "src/cache/LegacyCacheCleanup";
import { buildFsName } from "src/git/backends/GitFsName";
import { CacheMaintenanceService } from "src/services/CacheMaintenanceService";

vi.mock("src/cache/LegacyCacheCleanup", () => ({
	dropCaches: vi.fn(),
	surveyForeignCaches: vi.fn(),
}));

function makePlugin(
	remote: unknown = "https://example.com/quartz.git",
): QuartzSyncer {
	return {
		app: {
			appId: "f63162654e1059c1",
			vault: { getName: () => "test-vault" },
		},
		manifest: { id: "quartz-syncer", version: "not-the-app-version" },
		appVersion: "2.0.11",
		settings: {
			gitRemoteUrl: remote,
			gitBranch: "v5",
			publishTarget: "local",
		},
	} as unknown as QuartzSyncer;
}

describe("CacheMaintenanceService", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(surveyForeignCaches).mockResolvedValue([
			"foreign-quartz-syncer-status",
		]);
	});

	it("constructs the scope and protects the configured clone even when publishing locally", async () => {
		const plugin = makePlugin();
		const service = new CacheMaintenanceService(plugin);
		await expect(service.survey()).resolves.toEqual({
			names: ["foreign-quartz-syncer-status"],
		});
		expect(surveyForeignCaches).toHaveBeenCalledExactlyOnceWith(
			{
				appId: "f63162654e1059c1",
				vaultName: "test-vault",
				pluginId: "quartz-syncer",
				version: "2.0.11",
			},
			[
				buildFsName(
					"f63162654e1059c1",
					"https://example.com/quartz.git",
					"v5",
				),
			],
		);
		expect(dropCaches).not.toHaveBeenCalled();
	});

	it.each(["", null, 123])(
		"does not add a live clone for an unconfigured remote: %s",
		async (remote) => {
			const service = new CacheMaintenanceService(makePlugin(remote));
			await service.survey();
			expect(surveyForeignCaches).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ appId: "f63162654e1059c1" }),
				[],
			);
			expect(dropCaches).not.toHaveBeenCalled();
		},
	);

	it("uses current settings on each explicit survey", async () => {
		const plugin = makePlugin();
		const service = new CacheMaintenanceService(plugin);
		plugin.settings.gitBranch = "main";
		await service.survey();
		expect(surveyForeignCaches).toHaveBeenCalledWith(expect.any(Object), [
			buildFsName(plugin.app.appId, plugin.settings.gitRemoteUrl, "main"),
		]);
	});

	it("drops only the passed reviewed names, never re-surveying", async () => {
		const names = Object.freeze(["reviewed-quartz-syncer-status"]);
		const result = { dropped: [...names], failed: [] };
		vi.mocked(dropCaches).mockResolvedValue(result);
		const service = new CacheMaintenanceService(makePlugin());
		await expect(service.drop(names)).resolves.toBe(result);
		expect(dropCaches).toHaveBeenCalledExactlyOnceWith(names);
		expect(surveyForeignCaches).not.toHaveBeenCalled();
	});

	it("preserves partial failure results", async () => {
		const result = { dropped: ["a"], failed: ["b"] };
		vi.mocked(dropCaches).mockResolvedValue(result);
		await expect(
			new CacheMaintenanceService(makePlugin()).drop(["a", "b"]),
		).resolves.toBe(result);
	});
});
