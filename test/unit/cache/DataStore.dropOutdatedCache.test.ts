import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "src/cache/DataStore";

const { createInstance, dropInstance, setStore, setDatabases } = vi.hoisted(
	() => {
		let currentStore = new Map<string, unknown>();
		let databaseList: IDBDatabaseInfo[] = [];

		const setStore = (store: Map<string, unknown>) => {
			currentStore = store;
		};

		const setDatabases = (list: IDBDatabaseInfo[]) => {
			databaseList = list;
		};

		const createInstance = vi.fn(() => ({
			getItem: vi.fn((key: string) =>
				Promise.resolve(currentStore.get(key)),
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
						await callback(value, key);
					}
				},
			),
			close: vi.fn(),
		}));

		return {
			createInstance,
			dropInstance: vi.fn<(name: string) => Promise<void>>(),
			setStore,
			setDatabases,
		};
	},
);

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: createInstance,
	dropStore: dropInstance,
}));

const VAULT = "my-vault";
const APP_ID = "app-id";
const VERSION = "1.0.0";
const DB_PREFIX = `quartz-syncer/cache/${VAULT}/${APP_ID}/`;
const CURRENT_DB = `${DB_PREFIX}${VERSION}`;

function makeIndexedDB(list: IDBDatabaseInfo[]): Pick<IDBFactory, "databases"> {
	return {
		databases: vi.fn(() => Promise.resolve(list)),
	};
}

describe("DataStore.dropOutdatedCache()", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
		dropInstance.mockClear();
	});

	it("returns early without enumerating when indexedDB is undefined", async () => {
		const store = new DataStore(VAULT, APP_ID, VERSION);

		const original = globalThis.indexedDB;

		Object.defineProperty(globalThis, "indexedDB", {
			value: undefined,
			writable: true,
			configurable: true,
		});

		await store.dropOutdatedCache();

		expect(dropInstance).not.toHaveBeenCalled();

		Object.defineProperty(globalThis, "indexedDB", {
			value: original,
			writable: true,
			configurable: true,
		});
	});

	it("returns early without enumerating when indexedDB.databases is unavailable", async () => {
		const store = new DataStore(VAULT, APP_ID, VERSION);

		Object.defineProperty(globalThis, "indexedDB", {
			value: {},
			writable: true,
			configurable: true,
		});

		await store.dropOutdatedCache();

		expect(dropInstance).not.toHaveBeenCalled();
	});

	it("does not delete the current-version database", async () => {
		const dbList: IDBDatabaseInfo[] = [
			{ name: CURRENT_DB, version: 1 },
			{ name: `${DB_PREFIX}0.9.0`, version: 1 },
		];

		Object.defineProperty(globalThis, "indexedDB", {
			value: makeIndexedDB(dbList),
			writable: true,
			configurable: true,
		});
		dropInstance.mockResolvedValue(undefined);

		const store = new DataStore(VAULT, APP_ID, VERSION);
		await store.dropOutdatedCache();

		expect(dropInstance).toHaveBeenCalledTimes(1);
		expect(dropInstance).toHaveBeenCalledWith(`${DB_PREFIX}0.9.0`);
		expect(dropInstance).not.toHaveBeenCalledWith(CURRENT_DB);
	});

	it("does not delete databases that do not match the quartz-syncer/cache/{vault}/{appId}/ prefix", async () => {
		const dbList: IDBDatabaseInfo[] = [
			{
				name: "quartz-syncer/cache/other-vault/app-id/1.0.0",
				version: 1,
			},
			{ name: "unrelated-database", version: 1 },
			{ name: `${DB_PREFIX}0.9.0`, version: 1 },
		];

		Object.defineProperty(globalThis, "indexedDB", {
			value: makeIndexedDB(dbList),
			writable: true,
			configurable: true,
		});
		dropInstance.mockResolvedValue(undefined);

		const store = new DataStore(VAULT, APP_ID, VERSION);
		await store.dropOutdatedCache();

		expect(dropInstance).toHaveBeenCalledTimes(1);
		expect(dropInstance).toHaveBeenCalledWith(`${DB_PREFIX}0.9.0`);
	});

	it("awaits each deletion sequentially: deletion N+1 does not start until N settles", async () => {
		const order: string[] = [];

		const makeTrackedDrop = (name: string) => {
			let resolve!: () => void;
			const p = new Promise<void>((res) => {
				resolve = res;
			});
			return {
				promise: p,
				resolve,
				name,
			};
		};

		const drops = [
			makeTrackedDrop(`${DB_PREFIX}0.7.0`),
			makeTrackedDrop(`${DB_PREFIX}0.8.0`),
			makeTrackedDrop(`${DB_PREFIX}0.9.0`),
		];

		let dropIndex = 0;

		dropInstance.mockImplementation((name: string) => {
			const drop = drops[dropIndex++]!;
			order.push(`start:${name}`);
			return drop.promise.then(() => {
				order.push(`finish:${name}`);
			});
		});

		const dbList: IDBDatabaseInfo[] = drops.map((d) => ({
			name: d.name,
			version: 1,
		}));

		Object.defineProperty(globalThis, "indexedDB", {
			value: makeIndexedDB(dbList),
			writable: true,
			configurable: true,
		});

		const dropOutdated = new DataStore(VAULT, APP_ID, VERSION);
		const methodPromise = dropOutdated.dropOutdatedCache();

		await Promise.resolve();
		await Promise.resolve();

		expect(order).toEqual([`start:${DB_PREFIX}0.7.0`]);

		drops[0]!.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(order).toContain(`finish:${DB_PREFIX}0.7.0`);
		expect(order).toContain(`start:${DB_PREFIX}0.8.0`);
		expect(order.indexOf(`start:${DB_PREFIX}0.8.0`)).toBeGreaterThan(
			order.indexOf(`finish:${DB_PREFIX}0.7.0`),
		);

		drops[1]!.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(order).toContain(`start:${DB_PREFIX}0.9.0`);
		expect(order.indexOf(`start:${DB_PREFIX}0.9.0`)).toBeGreaterThan(
			order.indexOf(`finish:${DB_PREFIX}0.8.0`),
		);

		drops[2]!.resolve();
		await methodPromise;

		expect(order).toEqual([
			`start:${DB_PREFIX}0.7.0`,
			`finish:${DB_PREFIX}0.7.0`,
			`start:${DB_PREFIX}0.8.0`,
			`finish:${DB_PREFIX}0.8.0`,
			`start:${DB_PREFIX}0.9.0`,
			`finish:${DB_PREFIX}0.9.0`,
		]);
	});

	it("a failing deletion is caught and does not abort remaining deletions", async () => {
		const dbList: IDBDatabaseInfo[] = [
			{ name: `${DB_PREFIX}0.7.0`, version: 1 },
			{ name: `${DB_PREFIX}0.8.0`, version: 1 },
			{ name: `${DB_PREFIX}0.9.0`, version: 1 },
		];

		Object.defineProperty(globalThis, "indexedDB", {
			value: makeIndexedDB(dbList),
			writable: true,
			configurable: true,
		});

		dropInstance
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("blocked"))
			.mockResolvedValueOnce(undefined);

		const store = new DataStore(VAULT, APP_ID, VERSION);

		await expect(store.dropOutdatedCache()).resolves.toBeUndefined();

		expect(dropInstance).toHaveBeenCalledTimes(3);
		expect(dropInstance).toHaveBeenCalledWith(`${DB_PREFIX}0.7.0`);
		expect(dropInstance).toHaveBeenCalledWith(`${DB_PREFIX}0.8.0`);
		expect(dropInstance).toHaveBeenCalledWith(`${DB_PREFIX}0.9.0`);
	});

	it("the overall promise does not resolve until all sequential deletions have settled", async () => {
		const resolvers: Array<() => void> = [];
		const dbList: IDBDatabaseInfo[] = [
			{ name: `${DB_PREFIX}0.7.0`, version: 1 },
			{ name: `${DB_PREFIX}0.8.0`, version: 1 },
		];

		Object.defineProperty(globalThis, "indexedDB", {
			value: makeIndexedDB(dbList),
			writable: true,
			configurable: true,
		});

		dropInstance.mockImplementation(
			() =>
				new Promise<void>((res) => {
					resolvers.push(res);
				}),
		);

		const store = new DataStore(VAULT, APP_ID, VERSION);
		let done = false;
		const methodPromise = store.dropOutdatedCache().then(() => {
			done = true;
		});

		await Promise.resolve();
		await Promise.resolve();
		expect(done).toBe(false);

		resolvers[0]?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(done).toBe(false);

		resolvers[1]?.();
		await methodPromise;
		expect(done).toBe(true);
	});
});
