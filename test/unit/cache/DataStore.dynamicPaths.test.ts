import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "src/cache/DataStore";
import type { QuartzSyncerCache } from "src/cache/DataStore";

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
		iterate: vi.fn(
			async (callback: (value: unknown, key: string) => void) => {
				for (const [key, value] of currentStore.entries()) {
					await callback(value, key);
				}
			},
		),
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

const makeEntry = (hasDynamicContent: boolean): QuartzSyncerCache => ({
	version: "1.0.0",
	time: 1000,
	sourceMtime: 1000,
	hasDynamicContent,
});

describe("DataStore.getDynamicContentPaths", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
		dropInstance.mockClear();
	});

	it("returns paths whose cache entry has hasDynamicContent true, stripping the file: prefix", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/dynamic.md", makeEntry(true));
		await store.persister.setItem("file:notes/static.md", makeEntry(false));

		const result = await store.getDynamicContentPaths();

		expect(result).toEqual(new Set(["notes/dynamic.md"]));
	});

	it("ignores non-file: keys when scanning", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("data.json", 1234);
		await store.persister.setItem("metadata", makeEntry(true));
		await store.persister.setItem("file:notes/dynamic.md", makeEntry(true));

		const result = await store.getDynamicContentPaths();

		expect(result.has("notes/dynamic.md")).toBe(true);
		expect(result.has("metadata")).toBe(false);
		expect(result.has("data.json")).toBe(false);
	});

	it("returns an empty set when no entries have hasDynamicContent true", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", makeEntry(false));
		await store.persister.setItem("file:notes/b.md", makeEntry(false));

		const result = await store.getDynamicContentPaths();

		expect(result.size).toBe(0);
	});

	it("returns an empty set when the store has no entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const result = await store.getDynamicContentPaths();

		expect(result.size).toBe(0);
	});

	it("performs exactly one persister.iterate() call and zero persister.getItem() calls", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", makeEntry(true));
		await store.persister.setItem("file:notes/b.md", makeEntry(false));

		const iterateSpy = vi.spyOn(store.persister, "iterate");
		const getItemSpy = vi.spyOn(store.persister, "getItem");

		await store.getDynamicContentPaths();

		expect(iterateSpy).toHaveBeenCalledTimes(1);
		expect(getItemSpy).not.toHaveBeenCalled();
	});

	it("serves from memoryCache when preloaded, calling iterate zero additional times", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/dynamic.md", makeEntry(true));
		await store.persister.setItem("file:notes/static.md", makeEntry(false));

		await store.preloadCache();

		const iterateSpy = vi.spyOn(store.persister, "iterate");
		const getItemSpy = vi.spyOn(store.persister, "getItem");

		const result = await store.getDynamicContentPaths();

		expect(result).toEqual(new Set(["notes/dynamic.md"]));
		expect(iterateSpy).not.toHaveBeenCalled();
		expect(getItemSpy).not.toHaveBeenCalled();
	});

	it("handles multiple dynamic paths in a single pass", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		for (let i = 0; i < 5; i++) {
			await store.persister.setItem(
				`file:notes/dyn-${i}.md`,
				makeEntry(true),
			);
		}
		for (let i = 0; i < 3; i++) {
			await store.persister.setItem(
				`file:notes/static-${i}.md`,
				makeEntry(false),
			);
		}

		const result = await store.getDynamicContentPaths();

		expect(result.size).toBe(5);
		for (let i = 0; i < 5; i++) {
			expect(result.has(`notes/dyn-${i}.md`)).toBe(true);
		}
		for (let i = 0; i < 3; i++) {
			expect(result.has(`notes/static-${i}.md`)).toBe(false);
		}
	});
});
