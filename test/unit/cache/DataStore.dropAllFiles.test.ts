import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "src/cache/DataStore";
import { DEFAULT_SETTINGS } from "src/main";

const createDataStore = () =>
	new DataStore("vault", "app", "1.0.0", "", () => DEFAULT_SETTINGS);

const { createInstance, setStore } = vi.hoisted(() => {
	let currentStore = new Map<string, unknown>();
	const setStore = (store: Map<string, unknown>) => {
		currentStore = store;
	};
	const createInstance = vi.fn(() => ({
		// Match IndexedDBStore's null-on-miss contract.
		getItem: vi.fn((key: string) =>
			Promise.resolve(currentStore.get(key) ?? null),
		),
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
					callback(value, key);
				}
			},
		),
		close: vi.fn(),
	}));

	return { createInstance, setStore };
});

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: createInstance,
	dropStore: vi.fn(),
}));

describe("DataStore.dropAllFiles()", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
	});

	it.each([false, true])(
		"removes every seeded file from listing and lookup (updated: %s)",
		async (updated) => {
			const store = createDataStore();
			const paths = [
				"notes/a.md",
				"notes/nested/b.md",
				"media/image.png",
			];

			for (const path of paths) {
				await store.storeLocalHash(
					path,
					1000,
					`hash:${path}`,
					[],
					1000,
				);
			}
			await store.persister.setItem("data.json", 1000);

			if (updated) {
				await store.storeLocalHash(
					"notes/a.md",
					2000,
					"updated-hash",
					[],
					2000,
				);
			}

			expect(await store.allFiles()).toEqual(paths);
			for (const path of paths) {
				const mtime = updated && path === "notes/a.md" ? 2000 : 1000;
				expect(await store.loadFile(path, mtime)).toMatchObject({
					version: "1.0.0",
					localHash:
						updated && path === "notes/a.md"
							? "updated-hash"
							: `hash:${path}`,
				});
			}

			await store.dropAllFiles();

			expect(await store.allFiles()).toEqual([]);
			for (const path of paths) {
				expect(await store.loadFile(path, 1000)).toBeNull();
			}
			expect(await store.getLastUpdateTimestamp()).toBe(1000);

			const reopened = createDataStore();
			expect(await reopened.allFiles()).toEqual([]);
			for (const path of paths) {
				expect(await reopened.loadFile(path, 1000)).toBeNull();
			}
		},
	);
});
