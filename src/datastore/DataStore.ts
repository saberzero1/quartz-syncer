import localforage from "localforage";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";

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

/** Simpler wrapper for a file-backed cache for arbitrary metadata. */
export class DataStore {
	public persister: LocalForage;

	public constructor(
		public appId: string,
		public version: string,
	) {
		this.persister = localforage.createInstance({
			name: `quartz-syncer/cache/${appId}/${version}`,
			driver: [localforage.INDEXEDDB],
			description:
				"Cache metadata about files and sections in the quartz syncer index.",
		});
	}

	/** Drop the entire cache instance and re-create a new fresh instance. */
	public async recreate() {
		await localforage.dropInstance({
			name: "quartz-syncer/cache/" + this.appId,
		});

		this.persister = localforage.createInstance({
			name: "quartz-syncer/cache/" + this.appId,
			driver: [localforage.INDEXEDDB],
			description:
				"Cache metadata about files and sections in the quartz syncer index.",
		});
	}

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

	public async isRemoteFileOutdated(path: string): Promise<boolean> {
		const data = (await this.persister.getItem(
			this.fileKey(path),
		)) as QuartzSyncerCache;

		if (data && data.remoteData) {
			return data.version !== this.version;
		}

		return true; // No cached data found, consider it outdated
	}

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

	public async storeLocalFile(
		path: string,
		timestamp: number,
		data: TCompiledFile,
	): Promise<void> {
		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			localData: data,
		});
	}

	public async storeRemoteFile(
		path: string,
		timestamp: number,
		data: TCompiledFile,
	): Promise<void> {
		await this.persister.setItem(this.fileKey(path), {
			version: this.version,
			time: timestamp ?? Date.now(),
			remoteData: data,
		});
	}

	/** Load file metadata by path. */
	public async loadFile(
		path: string,
	): Promise<QuartzSyncerCache | null | undefined> {
		return this.persister.getItem(this.fileKey(path)).then((raw) => {
			return raw as QuartzSyncerCache | null | undefined;
		});
	}

	public async dropFile(path: string): Promise<void> {
		await this.persister.removeItem(this.fileKey(path));
	}

	public async dropAllFiles(): Promise<void> {
		const keys = await this.allFiles();

		for (const key of keys) {
			console.log("Dropping file key:", key);
			await this.persister.removeItem(this.fileKey(key));
		}
	}

	/** Drop old file keys that no longer exist. */
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

	/** Obtain a list of all metadata keys. */
	public async allKeys(): Promise<string[]> {
		return this.persister.keys();
	}

	/** Obtain a list of all persisted files. */
	public async allFiles(): Promise<string[]> {
		const keys = await this.allKeys();

		return keys
			.filter((k) => k.startsWith("file:"))
			.map((k) => k.substring(5));
	}

	/** Get a unique key for a given file path. */
	public fileKey(path: string): string {
		return "file:" + path;
	}
}
