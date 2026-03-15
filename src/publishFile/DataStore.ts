import localforage from "localforage";
import QuartzSyncer from "main";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { generateBlobHash } from "src/utils/utils";
import { LoadingController } from "src/models/ProgressBar";

/** A piece of data that has been cached for a specific version and time. */
export type QuartzSyncerCache = {
	/** The version of the plugin that the data was written to cache with. */
	version: string;
	/** The UNIX epoch time in milliseconds that the data was written to cache. */
	time: number;
	/** Local file hash */
	localHash?: string;
	/** Remote file hash */
	remoteHash?: string;
	/** Local file data, if available. */
	localData?: TCompiledFile | null;
	/** Remote file data, if available. */
	remoteData?: TCompiledFile | null;
	/** Whether the file contains dynamic content (Dataview, Datacore, etc.) that depends on other files. */
	hasDynamicContent?: boolean;
};

/**
 * Simpler wrapper for a file-backed cache for arbitrary metadata.
 *
 * This class provides methods to store, retrieve, and manage metadata about files and sections
 * in the Quartz Syncer index.
 */
export class DataStore {
	public persister: LocalForage;

	/**
	 * In-memory cache for bulk-preloaded entries.
	 * When populated via `preloadCache()`, all read methods serve from memory
	 * instead of making individual IndexedDB round-trips.
	 * Write methods update only the in-memory cache (write-back).
	 * Call `flushCache()` to persist dirty entries to IndexedDB.
	 */
	private memoryCache: Map<string, QuartzSyncerCache> | null = null;

	/**
	 * Tracks keys that have been modified in the in-memory cache
	 * and need to be flushed to IndexedDB.
	 */
	private dirtyKeys: Set<string> = new Set();

	/**
	 * Create a new DataStore instance for caching metadata about files and sections.
	 *
	 * @param vaultName - The name of the vault to use for the cache instance.
	 * @param appId - The application ID to use for the cache instance.
	 * @param version - The version of the application to use for the cache instance.
	 */
	public constructor(
		public vaultName: string,
		public appId: string,
		public version: string,
	) {
		this.persister = localforage.createInstance({
			name: `quartz-syncer/cache/${vaultName}/${appId}/${version}`,
			driver: [localforage.INDEXEDDB],
			description:
				"Cache metadata about files and sections in the quartz syncer index.",
		});
	}

	/**
	 * Bulk-preload all cache entries from IndexedDB into memory.
	 * After this call, all read methods serve from the in-memory Map,
	 * eliminating per-file IndexedDB round-trips.
	 * Call `clearMemoryCache()` when the batch operation is complete.
	 */
	public async preloadCache(): Promise<void> {
		const cache = new Map<string, QuartzSyncerCache>();

		await this.persister.iterate<QuartzSyncerCache, void>((value, key) => {
			if (key.startsWith("file:")) {
				cache.set(key, value);
			}
		});

		this.memoryCache = cache;
	}

	/**
	 * Clear the in-memory cache.
	 * Call after a batch operation to free memory.
	 */
	public clearMemoryCache(): void {
		this.memoryCache = null;
		this.dirtyKeys.clear();
	}

	/**
	 * Flush all dirty in-memory cache entries to IndexedDB.
	 * Call this after a batch operation completes to persist changes.
	 * Writes are done sequentially to avoid IndexedDB transaction contention.
	 */
	public async flushCache(controller?: LoadingController): Promise<void> {
		if (!this.memoryCache || this.dirtyKeys.size === 0) {
			return;
		}

		const total = this.dirtyKeys.size;
		let flushed = 0;

		for (const key of this.dirtyKeys) {
			const data = this.memoryCache.get(key);

			if (data) {
				await this.persister.setItem(key, data);
			}

			flushed++;

			if (controller) {
				controller.setProgress(Math.floor((flushed / total) * 100));
				controller.setIndexText(`Saving: ${flushed}/${total}`);
			}
		}

		this.dirtyKeys.clear();
	}

	/**
	 * Get a cache entry from memory (if preloaded) or IndexedDB.
	 * This is the single read path used by all accessor methods.
	 */
	private async getCacheEntry(
		path: string,
	): Promise<QuartzSyncerCache | null> {
		const key = this.fileKey(path);

		if (this.memoryCache) {
			return this.memoryCache.get(key) ?? null;
		}

		return (await this.persister.getItem(key)) as QuartzSyncerCache | null;
	}

	/**
	 * Store a cache entry to IndexedDB and update the in-memory cache if active.
	 */
	private async setCacheEntry(
		path: string,
		data: QuartzSyncerCache,
	): Promise<void> {
		const key = this.fileKey(path);

		if (this.memoryCache) {
			// Write-back: only update memory, mark dirty for later flush.
			this.memoryCache.set(key, data);
			this.dirtyKeys.add(key);

			return;
		}

		// No memory cache active — write directly to IndexedDB.
		await this.persister.setItem(key, data);
	}

	/**
	 * Drop the entire cache instance and re-create a new fresh instance.
	 *
	 * @returns A promise that resolves when the cache is recreated.
	 */
	public async recreate() {
		await localforage.dropInstance({
			name: `quartz-syncer/cache/${this.vaultName}/${this.appId}/${this.version}`,
		});

		await this.dropOutdatedCache();

		this.persister = localforage.createInstance({
			name: `quartz-syncer/cache/${this.vaultName}/${this.appId}/${this.version}`,
			driver: [localforage.INDEXEDDB],
			description:
				"Cache metadata about files and sections in the quartz syncer index.",
		});
	}

	/**
	 * Drop outdated cache instance. This is used to clear the cache when the version changes.
	 *
	 * returns A promise that resolves when the cache is dropped.
	 */
	public async dropOutdatedCache(): Promise<void> {
		// Get all IndexedDB instances
		const instances = await indexedDB.databases();

		// Filter instances that match the current vault and app ID
		const matchingInstances = instances.filter(
			(instance) =>
				instance.name &&
				instance.name.startsWith(
					`quartz-syncer/cache/${this.vaultName}/${this.appId}/`,
				) &&
				instance.name !==
					`quartz-syncer/cache/${this.vaultName}/${this.appId}/${this.version}`, // Exclude the current version
		);

		// Drop each matching instance
		for (const instance of matchingInstances) {
			// instance.name is guaranteed to be non-null due to the filter above
			indexedDB.deleteDatabase(instance.name!);
		}
	}

	/**
	 * Check if a local file is outdated compared to the given timestamp and version.
	 *
	 * @param path - The file path to check for outdated status.
	 * @param timestamp - The UNIX epoch time in milliseconds to compare against.
	 * @returns A promise that resolves to true if the local file is outdated, false otherwise.
	 */
	public async isLocalFileOutdated(
		path: string,
		timestamp: number,
	): Promise<boolean> {
		const data = await this.getCacheEntry(path);

		if (data && data.localData) {
			// Files with dynamic content (Dataview, Datacore) must always recompile
			// because their output depends on data from other files
			if (data.hasDynamicContent) {
				return true;
			}

			return data.time < timestamp || data.version !== this.version;
		}

		return true; // No cached data found, consider it outdated
	}

	/**
	 * Check if a cached file has dynamic content flag set.
	 *
	 * @param path - The file path to check.
	 * @returns A promise that resolves to true if the file has dynamic content, false otherwise.
	 */
	public async hasDynamicContentFlag(path: string): Promise<boolean> {
		const data = await this.getCacheEntry(path);

		return data?.hasDynamicContent ?? false;
	}

	/**
	 * Check if the remote file is outdated compared to the current version.
	 *
	 * @param path - The file path to check for outdated status.
	 * @returns A promise that resolves to true if the remote file is outdated, false otherwise.
	 */
	public async isRemoteFileOutdated(path: string): Promise<boolean> {
		const data = await this.getCacheEntry(path);

		if (data && data.remoteData) {
			return data.version !== this.version;
		}

		return true; // No cached data found, consider it outdated
	}

	/**
	 * Check if the local and remote files are identical in the cache.
	 *
	 * @param path - The file path to check for identity.
	 * @returns A promise that resolves to true if they are identical, false otherwise.
	 */
	public async areLocalAndRemoteIdentical(path: string): Promise<boolean> {
		const data = await this.getCacheEntry(path);

		if (data && data.localData && data.remoteData) {
			return (
				data.localHash === data.remoteHash &&
				data.version === this.version
			);
		}

		return false; // No cached data found or hashes do not match
	}

	/**
	 * Load a local file from the cache.
	 *
	 * @param path - The file path to load the local file for.
	 * @returns A promise that resolves to the local file data, or null if not found.
	 */
	public async loadLocalFile(
		path: string,
	): Promise<TCompiledFile | null | undefined> {
		const data = await this.getCacheEntry(path);

		if (data && data.localData) {
			return data.localData;
		}

		return null; // No cached data found
	}

	/**
	 * Load a remote file from the cache.
	 *
	 * @param path - The file path to load the remote file for.
	 * @returns A promise that resolves to the remote file data, or null if not found.
	 */
	public async loadRemoteFile(
		path: string,
	): Promise<TCompiledFile | null | undefined> {
		const data = await this.getCacheEntry(path);

		if (data && data.remoteData) {
			return data.remoteData;
		}

		return null; // No cached data found
	}

	/**
	 * Store a local file in the cache.
	 *
	 * @param path - The file path to store the local file for.
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the data.
	 * @param data - The local file data to store.
	 * @param hasDynamicContent - Whether the file contains dynamic content (Dataview, Datacore, etc.).
	 */
	public async storeLocalFile(
		path: string,
		timestamp: number,
		data: TCompiledFile,
		hasDynamicContent?: boolean,
	): Promise<void> {
		const existingData = await this.getCacheEntry(path);

		await this.setCacheEntry(path, {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: data,
			localHash: existingData?.localHash ?? generateBlobHash(data[0]),
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
			hasDynamicContent:
				hasDynamicContent ?? existingData?.hasDynamicContent,
		});
	}

	/**
	 * Store a remote file in the cache.
	 *
	 * @param path - The file path to store the remote file for.
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the data.
	 * @param data - The remote file data to store.
	 */
	public async storeRemoteFile(
		path: string,
		timestamp: number,
		data: TCompiledFile,
	): Promise<void> {
		const existingData = await this.getCacheEntry(path);

		await this.setCacheEntry(path, {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: existingData?.localHash, // Preserve local hash if it exists
			remoteData: data,
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
			hasDynamicContent: existingData?.hasDynamicContent, // Preserve dynamic content flag
		});
	}

	/**
	 * Load the local file hash from the cache.
	 *
	 * @param path - The file path to load the local hash for.
	 * @returns A promise that resolves to the local hash, or null if not found.
	 */
	public async loadLocalHash(
		path: string,
	): Promise<string | null | undefined> {
		const data = await this.getCacheEntry(path);

		if (data && data.localHash) {
			return data.localHash;
		}

		return null; // No cached data found
	}

	/**
	 * Load the remote file hash from the cache.
	 *
	 * @param path - The file path to load the remote hash for.
	 * @returns A promise that resolves to the remote hash, or null if not found.
	 */
	public async loadRemoteHash(
		path: string,
	): Promise<string | null | undefined> {
		const data = await this.getCacheEntry(path);

		if (data && data.remoteHash) {
			return data.remoteHash;
		}

		return null; // No cached data found
	}

	/**
	 * Store a local file hash in the cache.
	 *
	 * @param path - The file path to store the local hash for.
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the data.
	 * @param hash - The hash of the local file.
	 */
	public async storeLocalHash(
		path: string,
		timestamp: number,
		hash: string,
	): Promise<void> {
		const existingData = await this.getCacheEntry(path);

		await this.setCacheEntry(path, {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: hash,
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
			hasDynamicContent: existingData?.hasDynamicContent, // Preserve dynamic content flag
		});
	}

	/**
	 * Store the remote file hash in the cache.
	 *
	 * @param path - The file path to store the remote hash for.
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the remote hash.
	 * @param hash - The hash of the remote file to store.
	 * @returns A promise that resolves when the remote hash is stored.
	 */
	public async storeRemoteHash(
		path: string,
		timestamp: number,
		hash: string,
	): Promise<void> {
		const existingData = await this.getCacheEntry(path);

		await this.setCacheEntry(path, {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: existingData?.localHash, // Preserve local hash if it exists
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: hash,
			hasDynamicContent: existingData?.hasDynamicContent, // Preserve dynamic content flag
		});
	}

	/**
	 * Get the time when the file was last cached.
	 *
	 * @param path - The file path to get the cached time for.
	 * @returns A promise that resolves to the cached time in milliseconds, or null if not found.
	 */
	public async getTime(path: string): Promise<number | null> {
		const data = await this.getCacheEntry(path);

		if (data) {
			return data.time;
		}

		return null; // No cached data found
	}

	/**
	 * Load file metadata by path.
	 *
	 * @param path - The file path to load metadata for.
	 * @returns A promise that resolves to the cached metadata for the file, or null if not found.
	 */
	public async loadFile(
		path: string,
	): Promise<QuartzSyncerCache | null | undefined> {
		return this.getCacheEntry(path).then((raw) => {
			return raw as QuartzSyncerCache | null | undefined;
		});
	}

	/**
	 * Drop a file from the cache.
	 *
	 * @param path - The file path to drop from the cache.
	 * @returns A promise that resolves when the file is dropped.
	 */
	public async dropFile(path: string): Promise<void> {
		await this.persister.removeItem(this.fileKey(path));
	}

	/**
	 * Drop all files in the cache.
	 *
	 * @returns A promise that resolves when all files are dropped.
	 */
	public async dropAllFiles(): Promise<void> {
		const keys = await this.allFiles();

		for (const key of keys) {
			await this.persister.removeItem(this.fileKey(key));
		}
	}

	/**
	 * Drop old file keys that no longer exist.
	 *
	 * @param existing - A list of existing file paths to keep in the cache.
	 * @returns A promise that resolves to a set of keys that were removed from the cache.
	 */
	public async synchronize(
		existing: string[] | Set<string>,
	): Promise<Set<string>> {
		const keys = new Set(await this.allFiles());
		for (const exist of existing) keys.delete(exist);

		// Any keys remaining after deleting existing keys are non-existent keys that should be cleared from cache.
		for (const key of keys)
			await this.persister.removeItem(this.fileKey(key));

		return keys;
	}

	/**
	 * Serializes the data store to data.json file.
	 *
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the data.
	 * @param plugin - The QuartzSyncer plugin instance to use for saving settings.
	 * @returns A promise that resolves to a tuple containing the saved timestamp and the DataStore as JSON string.
	 */
	public async saveToDataJson(
		timestamp: number,
		plugin: QuartzSyncer,
	): Promise<void> {
		const data: Record<string, QuartzSyncerCache> = {};
		const keys = await this.allKeys();

		for (const key of keys) {
			if (!key.startsWith("file:")) continue; // Only process file keys

			const value = await this.persister.getItem(key);

			if (value) {
				data[key] = value as QuartzSyncerCache;
			}
		}
		// Sort the keys to ensure consistent order
		Object.keys(data).sort();

		const jsonData = JSON.stringify(data, null, 2);

		plugin.settings.cache = jsonData;

		await plugin.saveSettings();
		await this.setLastUpdateTimestamp(timestamp, plugin);
	}

	/**
	 * Load the data store from data.json file.
	 *
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the data.
	 * @param plugin - The QuartzSyncer plugin instance to use for loading settings.
	 * @returns A promise that resolves when the cache is loaded from.
	 */
	public async loadFromDataJson(
		timestamp: number,
		plugin: QuartzSyncer,
	): Promise<void> {
		const cache = plugin.settings.cache;
		const data: Record<string, QuartzSyncerCache> = JSON.parse(cache);

		for (const [key, value] of Object.entries(data)) {
			await this.persister.setItem(key, value);
		}

		await this.setLastUpdateTimestamp(timestamp, plugin);

		return;
	}

	/**
	 * Obtain a list of all metadata keys.
	 *
	 * @returns A list of all keys in the cache.
	 */
	public async allKeys(): Promise<string[]> {
		return this.persister.keys();
	}

	/**
	 * Obtain a list of all persisted files.
	 *
	 * @returns A list of file paths that are stored in the cache.
	 */
	public async allFiles(): Promise<string[]> {
		const keys = await this.allKeys();

		return keys
			.filter((k) => k.startsWith("file:"))
			.map((k) => k.substring(5));
	}

	/**
	 * Get a unique key for a given file path.
	 *
	 * @param path - The file path to generate a key for.
	 * @returns A unique key for the file, prefixed with "file:".
	 */
	public fileKey(path: string): string {
		return "file:" + path;
	}

	/**
	 * Get the timestamp of the last cache update.
	 * @returns A promise that resolves to the timestamp of the last cache update, or null if not found.
	 */
	public async getLastUpdateTimestamp(): Promise<number | null> {
		const timestamp = await this.persister.getItem("data.json");

		if (timestamp) {
			return timestamp as number;
		}

		return null; // No cached timestamp found
	}

	/**
	 * Set the timestamp of the last cache update.
	 * @param timestamp - The UNIX epoch time in milliseconds to set for the last update.
	 * @param plugin - The QuartzSyncer plugin instance to use for saving settings.
	 * @returns A promise that resolves when the timestamp is set.
	 */
	public async setLastUpdateTimestamp(
		timestamp: number,
		plugin: QuartzSyncer,
	): Promise<void> {
		plugin.settings.cacheTimestamp = timestamp;

		await this.persister.setItem("data.json", timestamp);
		await plugin.saveSettings();
	}
}
