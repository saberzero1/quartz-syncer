export interface IndexedDBStore {
	getItem<T>(key: string): Promise<T | null>;
	setItem<T>(key: string, value: T): Promise<void>;
	removeItem(key: string): Promise<void>;
	keys(): Promise<string[]>;
	iterate<T>(
		callback: (value: T, key: string) => void,
	): Promise<void>;
}

export function createStore(name: string): IndexedDBStore {
	let dbPromise: Promise<IDBDatabase> | null = null;
	const STORE_NAME = "keyvaluepairs";

	function open(): Promise<IDBDatabase> {
		if (dbPromise) return dbPromise;
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(name, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return dbPromise;
	}

	async function tx(
		mode: IDBTransactionMode,
	): Promise<IDBObjectStore> {
		const db = await open();
		return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
	}

	function wrap<T>(request: IDBRequest<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	return {
		async getItem<T>(key: string): Promise<T | null> {
			const store = await tx("readonly");
			const result = await wrap(store.get(key));
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
						callback(cursor.value as T, String(cursor.key));
						cursor.continue();
					} else {
						resolve();
					}
				};
				request.onerror = () => reject(request.error);
			});
		},
	};
}

export function dropStore(name: string): void {
	indexedDB.deleteDatabase(name);
}
