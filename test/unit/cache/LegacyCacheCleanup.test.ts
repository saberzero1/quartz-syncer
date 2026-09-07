import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "src/cache/DataStore";
import {
	type CacheScope,
	dropStaleCaches,
	isStaleCacheName,
	liveCacheNames,
} from "src/cache/LegacyCacheCleanup";
import { parseGitFsGeneration } from "src/git/backends/GitFsName";

const { createInstance, dropInstance } = vi.hoisted(() => ({
	createInstance: vi.fn(() => ({})),
	dropInstance: vi.fn<(name: string) => Promise<void>>(),
}));

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: createInstance,
	dropStore: dropInstance,
}));

const scope: CacheScope = {
	appId: "319a0eefd0e81b84",
	vaultName: "myvault",
	pluginId: "quartz-syncer",
	version: "2.0.11",
};

const CURRENT_DB = "quartz-syncer/cache/319a0eefd0e81b84/quartz-syncer/2.0.11";
const LEGACY_DB = "quartz-syncer/cache/myvault/quartz-syncer/2.0.10";
const LEGACY_FS = "quartz-syncer-s2q7m9";
const CURRENT_FS = "quartz-syncer-2-319a0eefd0e81b84-s2q7m9";

function setIndexedDB(
	value: Pick<IDBFactory, "databases"> | object | undefined,
): void {
	Object.defineProperty(globalThis, "indexedDB", {
		value,
		writable: true,
		configurable: true,
	});
}

function setDatabases(list: IDBDatabaseInfo[]): void {
	setIndexedDB({
		databases: vi.fn(() => Promise.resolve(list)),
	});
}

describe("legacy cache cleanup", () => {
	const originalIndexedDB = Object.getOwnPropertyDescriptor(
		globalThis,
		"indexedDB",
	);

	beforeEach(() => {
		createInstance.mockClear();
		dropInstance.mockReset();
		dropInstance.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalIndexedDB) {
			Object.defineProperty(globalThis, "indexedDB", originalIndexedDB);
		} else {
			Reflect.deleteProperty(globalThis, "indexedDB");
		}
	});

	describe("liveCacheNames", () => {
		it("protects the appId DataStore and all still-live vault-name-scoped services", () => {
			expect(liveCacheNames(scope)).toEqual(
				new Set([
					CURRENT_DB,
					"myvault-quartz-syncer-status",
					"myvault-quartz-syncer-hub",
					"myvault-quartz-syncer-tree",
					"myvault-quartz-syncer-registry",
				]),
			);
		});
	});

	describe("parseGitFsGeneration", () => {
		it.each([
			[LEGACY_FS, 1],
			["quartz-syncer-0", 1],
			[CURRENT_FS, 2],
			["quartz-syncer-3-319a0eefd0e81b84-abc", 3],
			["quartz-syncer-1-vault-a-abc", 1],
			["quartz-syncer-2-vault-a-abc", 2],
			["quartz-syncer-10-vault-a-abc", 10],
			["quartz-syncer-01-vault-a-abc", 1],
		])("parses %s as generation %s", (name, generation) => {
			expect(parseGitFsGeneration(name)).toBe(generation);
		});

		it.each([
			CURRENT_DB,
			LEGACY_DB,
			"quartz-syncer/1-vault-abc",
			"quartz-syncer-",
			"quartz-syncer-ABC",
			"quartz-syncer-2--abc",
			"quartz-syncer-2-vault-",
			"quartz-syncer-x-vault-abc",
			"quartz-syncer-2-vault-ABC",
			"unrelated-database",
		])("rejects a name outside the LightningFS family: %s", (name) => {
			expect(parseGitFsGeneration(name)).toBeNull();
		});
	});

	describe("isStaleCacheName", () => {
		it.each([
			LEGACY_DB,
			"quartz-syncer/cache/myvault/quartz-syncer/2.0.11",
			"quartz-syncer/cache/319a0eefd0e81b84/quartz-syncer/2.0.10",
			LEGACY_FS,
			"quartz-syncer-1-vault-a-abc",
			"--status",
			"--hub",
			"--tree",
			"--registry",
		])("recognizes abandoned cache %s", (name) => {
			expect(isStaleCacheName(name, scope)).toBe(true);
		});

		it.each([
			CURRENT_DB,
			"quartz-syncer/cache/other-app-id/quartz-syncer/2.0.11",
			"quartz-syncer/cache/other-app-id/quartz-syncer/2.0.10",
			"quartz-syncer/cache/other-vault/quartz-syncer/2.0.10",
			"quartz-syncer/cache/myvault/quartz-syncer",
			"quartz-syncer/cache/myvault/quartz-syncer/2.0.10/extra",
			"quartz-syncer/cache/319a0eefd0e81b84/quartz-syncer",
			"quartz-syncer/cache/319a0eefd0e81b84/quartz-syncer/2.0.10/extra",
			"quartz-syncer/cache/myvault/other-plugin/2.0.10",
			"quartz-syncer/cache/319a0eefd0e81b84/other-plugin/2.0.10",
			CURRENT_FS,
			"quartz-syncer-2-other-vault-abc",
			"quartz-syncer-3-319a0eefd0e81b84-abc",
			"myvault-quartz-syncer-status",
			"myvault-quartz-syncer-hub",
			"myvault-quartz-syncer-tree",
			"myvault-quartz-syncer-registry",
			"other-vault-quartz-syncer-status",
			"dataview/cache/319a0eefd0e81b84",
			"319a0eefd0e81b84-backup",
			"unrelated-database",
			"--unknown",
		])(
			"preserves live, cross-vault, malformed or unrelated database %s",
			(name) => {
				expect(isStaleCacheName(name, scope)).toBe(false);
			},
		);

		it("protects a live DataStore even when the appId and vault name coincide", () => {
			expect(
				isStaleCacheName(CURRENT_DB, {
					...scope,
					vaultName: scope.appId,
				}),
			).toBe(false);
		});
	});

	describe("dropStaleCaches", () => {
		it.each([undefined, {}])(
			"returns no drops when IndexedDB enumeration is unavailable: %s",
			async (value) => {
				setIndexedDB(value);

				await expect(dropStaleCaches(scope)).resolves.toEqual([]);
				expect(dropInstance).not.toHaveBeenCalled();
			},
		);

		it("skips unnamed and live databases", async () => {
			setDatabases([{}, { name: "" }, { name: CURRENT_DB }]);

			await expect(dropStaleCaches(scope)).resolves.toEqual([]);
			expect(dropInstance).not.toHaveBeenCalled();
		});

		it("awaits deletions sequentially, continues after rejection, and reports only successes", async () => {
			const names = [LEGACY_DB, LEGACY_FS, "--status"];
			setDatabases(names.map((name) => ({ name })));
			const pending: Array<{
				resolve: () => void;
				reject: (error: Error) => void;
			}> = [];
			dropInstance.mockImplementation(
				() =>
					new Promise<void>((resolve, reject) => {
						pending.push({ resolve, reject });
					}),
			);
			const debug = vi
				.spyOn(console, "debug")
				.mockImplementation(() => {});
			const error = new Error("blocked");
			let done = false;
			const sweep = dropStaleCaches(scope).then((dropped) => {
				done = true;
				return dropped;
			});
			await Promise.resolve();
			expect(dropInstance.mock.calls).toEqual([[LEGACY_DB]]);
			expect(done).toBe(false);

			pending[0]?.resolve();
			await Promise.resolve();
			expect(dropInstance.mock.calls).toEqual([[LEGACY_DB], [LEGACY_FS]]);
			expect(done).toBe(false);

			pending[1]?.reject(error);
			await Promise.resolve();
			expect(dropInstance.mock.calls).toEqual(
				names.map((name) => [name]),
			);
			expect(done).toBe(false);
			expect(debug).toHaveBeenCalledExactlyOnceWith(
				`Failed to drop stale cache "${LEGACY_FS}":`,
				error,
			);

			pending[2]?.resolve();
			await expect(sweep).resolves.toEqual([LEGACY_DB, "--status"]);
			expect(done).toBe(true);
		});

		it("drops exactly the orphaned databases from the issue #144 screenshot", async () => {
			const dropped = [
				"quartz-syncer/cache/myvault/quartz-syncer/2.0.10",
				"quartz-syncer-s2q7m9",
				"--status",
			];
			const survivors = [
				"quartz-syncer/cache/319a0eefd0e81b84/quartz-syncer/2.0.11",
				"quartz-syncer-2-319a0eefd0e81b84-s2q7m9",
				"myvault-quartz-syncer-hub",
				"myvault-quartz-syncer-status",
				"myvault-quartz-syncer-tree",
				"dataview/cache/319a0eefd0e81b84",
				"319a0eefd0e81b84-backup",
				"319a0eefd0e81b84-cache",
				"inverse-metadatacache/319a0eefd0e81b84",
			];
			const databases = [...dropped, ...survivors];
			setDatabases(databases.map((name) => ({ name, version: 1 })));

			await expect(dropStaleCaches(scope)).resolves.toEqual(dropped);
			expect(dropInstance.mock.calls).toEqual(
				dropped.map((name) => [name]),
			);
			expect(
				databases.filter((name) => !isStaleCacheName(name, scope)),
			).toEqual(survivors);
			for (const name of survivors) {
				expect(dropInstance).not.toHaveBeenCalledWith(name);
			}
		});
	});

	it("DataStore forwards its legacy vault name while retaining its live name and void cleanup result", async () => {
		setDatabases([{ name: LEGACY_DB }, { name: CURRENT_DB }]);
		const store = new DataStore(
			scope.appId,
			scope.pluginId,
			scope.version,
			scope.vaultName,
		);

		await expect(store.dropOutdatedCache()).resolves.toBeUndefined();
		expect(createInstance).toHaveBeenCalledExactlyOnceWith(CURRENT_DB);
		expect(dropInstance).toHaveBeenCalledExactlyOnceWith(LEGACY_DB);
	});
});
