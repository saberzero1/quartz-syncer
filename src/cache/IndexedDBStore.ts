export interface IndexedDBStore {
	getItem<T>(key: string): Promise<T | null>;
	setItem<T>(key: string, value: T): Promise<void>;
	removeItem(key: string): Promise<void>;
	keys(): Promise<string[]>;
	iterate<T>(callback: (value: T, key: string) => void): Promise<void>;
}

export function createStore(name: string): IndexedDBStore {
	let dbPromise: Promise<IDBDatabase> | null = null;
	const STORE_NAME = "keyvaluepairs";

	function open(): Promise<IDBDatabase> {
		if (dbPromise) return dbPromise;
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(name);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
			request.onsuccess = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.close();
					const upgradeRequest = indexedDB.open(name, db.version + 1);
					upgradeRequest.onupgradeneeded = () => {
						const upgradedDb = upgradeRequest.result;
						if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
							upgradedDb.createObjectStore(STORE_NAME);
						}
					};
					upgradeRequest.onsuccess = () =>
						resolve(upgradeRequest.result);
					upgradeRequest.onerror = () =>
						reject(
							upgradeRequest.error ??
								new Error("IndexedDB upgrade failed"),
						);
					return;
				}
				resolve(db);
			};
			request.onerror = () =>
				reject(request.error ?? new Error("IndexedDB open failed"));
		});
		return dbPromise;
	}

	async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
		const db = await open();
		return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
	}

	function wrap<T>(request: IDBRequest<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error("IndexedDB request failed"));
		});
	}

	return {
		async getItem<T>(key: string): Promise<T | null> {
			const store = await tx("readonly");
			const result: unknown = await wrap(store.get(key));
			return (result as T) ?? null;
		},
		async setItem<T>(key: string, value: T): Promise<void> {
			const store = await tx("readwrite");
			await wrap(store.put(value, key));
		},
		async removeItem(key: string): Promise<void> {
			const store = await tx("readwrite");
			await wrap(store.delete(key));
		},
		async keys(): Promise<string[]> {
			const store = await tx("readonly");
			const result = await wrap(store.getAllKeys());
			return result.map(String);
		},
		async iterate<T>(
			callback: (value: T, key: string) => void,
		): Promise<void> {
			const store = await tx("readonly");
			return new Promise((resolve, reject) => {
				const request = store.openCursor();
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						const key =
							typeof cursor.key === "string"
								? cursor.key
								: JSON.stringify(cursor.key);
						callback(cursor.value as T, key);
						cursor.continue();
					} else {
						resolve();
					}
				};
				request.onerror = () =>
					reject(
						request.error ?? new Error("IndexedDB cursor failed"),
					);
			});
		},
	};
}

export function dropStore(name: string): void {
	indexedDB.deleteDatabase(name);
}
