import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore, type QuartzSyncerCache } from "src/cache/DataStore";
import { DEFAULT_SETTINGS } from "src/main";
import { settingsFingerprint } from "src/cache/CompiledEntryValidity";

const settings = { ...DEFAULT_SETTINGS, useDataview: true, useDatacore: true };

const { createInstance, dropInstance, setStore } = vi.hoisted(() => {
	let currentStore = new Map<string, unknown>();
	const setStore = (store: Map<string, unknown>) => {
		currentStore = store;
	};
	const createInstance = vi.fn(() => ({
		getItem: vi.fn((key: string) => Promise.resolve(currentStore.get(key))),
		setItem: vi.fn((key: string, value: unknown) => {
			currentStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: vi.fn((key: string) => {
			currentStore.delete(key);
			return Promise.resolve();
		}),
		keys: vi.fn(() => Promise.resolve(Array.from(currentStore.keys()))),
		iterate: vi.fn(),
	}));

	return {
		createInstance,
		dropInstance: vi.fn(),
		setStore,
	};
});

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: createInstance,
	dropStore: dropInstance,
}));

const createDataStore = (
	revisions: {
		dataviewRevision: number | undefined;
		datacoreRevision: number | undefined;
	} = { dataviewRevision: 11, datacoreRevision: 17 },
) =>
	new DataStore(
		"vault",
		"app",
		"1.0.0",
		"",
		() => settings,
		() => revisions,
	);

const storedEntry = async (store: DataStore): Promise<QuartzSyncerCache> => {
	const cache = await store.exportCache();
	return cache["file:notes/dynamic.md"]!;
};

const storeCompilation = async (
	store: DataStore,
	dynamicSources: string[],
	currentMtime = 1000,
): Promise<void> => {
	const captured = store.captureCompilationRevisions();
	await store.storeCompilation("notes/dynamic.md", {
		localData: ["compiled", { blobs: [] }],
		localHash: "hash",
		dynamicSources,
		sourceMtime: 1000,
		currentMtime,
		settingsFingerprint: settingsFingerprint(settings),
		detectorVersion: "vault-dependencies-v2",
		verifiedRevisions: {
			dataviewRevision: dynamicSources.includes("dataview")
				? captured.dataviewRevision
				: undefined,
			datacoreRevision: dynamicSources.includes("datacore")
				? captured.datacoreRevision
				: undefined,
		},
	});
};

describe("DataStore dynamic compilation metadata", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
		dropInstance.mockClear();
	});

	it("persists verified revisions with the dynamic classification", async () => {
		const store = createDataStore();
		await storeCompilation(store, ["dataview", "datacore"]);

		expect(await storedEntry(store)).toMatchObject({
			dynamicSources: ["dataview", "datacore"],
			dataviewRevision: 11,
			datacoreRevision: 17,
			sourceMtime: 1000,
		});
	});

	it("stores a static classification without revisions", async () => {
		const store = createDataStore();
		await storeCompilation(store, []);

		const entry = await storedEntry(store);
		expect(entry.dynamicSources).toEqual([]);
		expect(entry).not.toHaveProperty("dataviewRevision");
		expect(entry).not.toHaveProperty("datacoreRevision");
	});

	it("stores dynamic classification when revision APIs are unavailable", async () => {
		const store = createDataStore({
			dataviewRevision: undefined,
			datacoreRevision: undefined,
		});
		await storeCompilation(store, ["dataview", "datacore"]);

		const entry = await storedEntry(store);
		expect(entry.dynamicSources).toEqual(["dataview", "datacore"]);
		expect(entry.dataviewRevision).toBeUndefined();
		expect(entry.datacoreRevision).toBeUndefined();
	});

	it.each([
		["dataview", 11, "datacoreRevision"],
		["datacore", 17, "dataviewRevision"],
	] as const)(
		"persists only the verified %s revision without cross-contamination",
		async (source, revision, absentProperty) => {
			const store = createDataStore();
			await storeCompilation(store, [source]);

			const entry = await storedEntry(store);
			expect(entry[`${source}Revision`]).toBe(revision);
			expect(entry[absentProperty]).toBeUndefined();
		},
	);

	it("refreshes retained revisions on every dynamic compilation write", async () => {
		let dataviewRevision = 11;
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => settings,
			() => ({ dataviewRevision, datacoreRevision: undefined }),
		);
		await storeCompilation(store, ["dataview"]);
		dataviewRevision = 12;
		await storeCompilation(store, ["dataview"]);

		expect(await storedEntry(store)).toMatchObject({
			dynamicSources: ["dataview"],
			dataviewRevision: 12,
		});
	});

	it.each([
		["dataview", 11],
		["datacore", 17],
		["dataview", undefined],
		["datacore", undefined],
	] as const)(
		"rejects a stale %s compilation write at revision %s",
		async (source, revision) => {
			const store = createDataStore({
				dataviewRevision: source === "dataview" ? revision : undefined,
				datacoreRevision: source === "datacore" ? revision : undefined,
			});
			await storeCompilation(store, [source], 1001);

			expect(await store.exportCache()).toEqual({});
		},
	);
});
