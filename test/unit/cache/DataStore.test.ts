import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "src/cache/DataStore";

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
		iterate: vi.fn(async (callback) => {
			for (const [key, value] of currentStore.entries()) {
				await callback(value, key);
			}
		}),
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

describe("DataStore", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
		dropInstance.mockClear();
	});

	it("returns cached file when mtime matches", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			false,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toEqual(["hello", { blobs: [] }]);
	});

	it("returns null for cache miss", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		const cached = await store.loadLocalFile("notes/missing.md", 1000);
		expect(cached).toBeNull();
	});

	it("invalidates cache when mtime changes", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			false,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 2000);

		expect(cached).toBeNull();
	});

	it("skips cached data for dynamic content", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			true,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toBeNull();
	});

	it("preload and flush writes dirty entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.preloadCache();

		await store.storeLocalHash("notes/test.md", 1000, "hash", 1000);

		const persister = store.persister as unknown as {
			setItem: ReturnType<typeof vi.fn>;
		};

		expect(persister.setItem).toHaveBeenCalledTimes(0);

		await store.flushCache();

		expect(persister.setItem).toHaveBeenCalledTimes(1);
	});

	it("exports an empty cache when no entries exist", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const result = await store.exportCache();

		expect(result).toEqual({});
	});

	it("exports all cached file entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", {
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
		await store.persister.setItem("file:notes/b.md", {
			version: "1.0.0",
			time: 200,
			sourceMtime: 200,
		});

		const result = await store.exportCache();

		expect(Object.keys(result).sort()).toEqual([
			"file:notes/a.md",
			"file:notes/b.md",
		]);
	});

	it("imports cache entries into the persister", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
			"file:notes/b.md": {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
			},
		});

		expect(count).toBe(2);
		expect(await store.persister.getItem("file:notes/a.md")).toEqual({
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
	});

	it("skips non-file keys when importing cache entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
			metadata: {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
			},
		});

		expect(count).toBe(1);
		expect(await store.persister.getItem("metadata")).toBeUndefined();
	});

	it("roundtrips cache exports into a new store", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", {
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
		await store.persister.setItem("file:notes/b.md", {
			version: "1.0.0",
			time: 200,
			sourceMtime: 200,
		});

		const exported = await store.exportCache();

		setStore(new Map());
		const importedStore = new DataStore("vault", "app", "1.0.0");
		await importedStore.importCache(exported);
		const imported = await importedStore.exportCache();

		expect(imported).toEqual(exported);
	});
});
