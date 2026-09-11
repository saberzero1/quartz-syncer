import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "src/cache/IndexedDBStore";
import { HubDetectionCache } from "src/services/HubDetectionCache";

const { getItem } = vi.hoisted(() => ({
	getItem: vi.fn(),
}));

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: vi.fn(() => ({ getItem })),
}));

describe("HubDetectionCache", () => {
	beforeEach(() => {
		vi.mocked(createStore).mockClear();
		getItem.mockReset();
	});

	it.each([
		["319a0eefd0e81b84", "319a0eefd0e81b84-quartz-syncer-hub"],
		["other-app-id", "other-app-id-quartz-syncer-hub"],
	])("keys persistence by appId %s", (appId, storeName) => {
		const cache = new HubDetectionCache();
		cache.enablePersistence(appId, "quartz-syncer");

		expect(createStore).toHaveBeenCalledExactlyOnceWith(storeName);
	});

	it("loads detection results from the appId-scoped store", async () => {
		const quartzVersion = { data: "5.0.0", time: Date.now() };
		getItem.mockResolvedValue({
			binaryInfo: null,
			quartzVersion,
			upgradeStatus: null,
		});
		const cache = new HubDetectionCache();
		cache.enablePersistence("319a0eefd0e81b84", "quartz-syncer");

		await cache.loadPersisted();

		expect(createStore).toHaveBeenCalledExactlyOnceWith(
			"319a0eefd0e81b84-quartz-syncer-hub",
		);
		expect(getItem).toHaveBeenCalledExactlyOnceWith("detection");
		expect(cache.quartzVersion).toEqual(quartzVersion);
	});
});
