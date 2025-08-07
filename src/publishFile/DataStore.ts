import localforage from "localforage";
import QuartzSyncer from "main";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { generateBlobHash } from "src/utils/utils";

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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		if (data && data.localData) {
			return data.time < timestamp || data.version !== this.version;
		}

		return true; // No cached data found, consider it outdated
	}

	/**
	 * Check if the remote file is outdated compared to the current version.
	 *
	 * @param path - The file path to check for outdated status.
	 * @returns A promise that resolves to true if the remote file is outdated, false otherwise.
	 */
	public async isRemoteFileOutdated(path: string): Promise<boolean> {
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
	 */
	public async storeLocalFile(
		path: string,
		timestamp: number,
		data: TCompiledFile,
	): Promise<void> {
		const existingData = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: data,
			localHash: existingData?.localHash ?? generateBlobHash(data[0]),
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
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
		const existingData = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: existingData?.localHash, // Preserve local hash if it exists
			remoteData: data,
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		const existingData = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: hash,
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: existingData?.remoteHash, // Preserve remote hash if it exists
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
		const existingData = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: existingData?.localData ?? null, // Preserve local data if it exists
			localHash: existingData?.localHash, // Preserve local hash if it exists
			remoteData: existingData?.remoteData ?? null, // Preserve remote data if it exists
			remoteHash: hash,
		});
	}

	/**
	 * Get the time when the file was last cached.
	 *
	 * @param path - The file path to get the cached time for.
	 * @returns A promise that resolves to the cached time in milliseconds, or null if not found.
	 */
	public async getTime(path: string): Promise<number | null> {
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

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
		return this.persister.getItem(this.fileKey(path)).then((raw) => {
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
