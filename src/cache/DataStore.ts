import {
	CACHE_READ_BATCH_SIZE,
	CACHE_WRITE_BATCH_SIZE,
	createStore,
	dropStore,
	type IndexedDBStore,
} from "src/cache/IndexedDBStore";
import { dropStaleCaches } from "src/cache/LegacyCacheCleanup";
import type QuartzSyncer from "src/main";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { generateBlobHash } from "src/utils/utils";
import type QuartzSyncerSettings from "src/models/settings";
import {
	currentCompilationRevisions,
	DYNAMIC_CONTENT_DETECTOR_VERSION,
	isCompiledEntryValid,
	isDynamicClassificationValid,
	settingsFingerprint,
	type CompilationRevisions,
	type CompiledEntryValidityCriteria,
	waitForSettingsFingerprintResolution,
} from "src/cache/CompiledEntryValidity";
import {
	getPerfMetrics,
	perfMetricsEnabled,
} from "src/operability/PerfMetrics";

/** Invalidate compiled payloads independently of the plugin release version. */
export const DATA_STORE_CACHE_VERSION = "deferred-assets-v1";

export type AssetShaCache = {
	mtime: number;
	gitSha: string;
};

/** A piece of data that has been cached for a specific version and time. */
type QuartzSyncerCacheBase = {
	/** The version of the plugin that the data was written to cache with. */
	version: string;
	/** The UNIX epoch time in milliseconds that the data was written to cache. */
	time: number;
	/** The local file mtime when the cache entry was created. */
	sourceMtime: number;
	/** Remote file hash */
	remoteHash?: string;
	/** Remote file data, if available. */
	remoteData?: TCompiledFile | null;
	settingsFingerprint: string;
	detectorVersion: string;
};

export type StaticQuartzSyncerCache = QuartzSyncerCacheBase & {
	dynamicSources: [];
	localHash?: string;
	localData?: TCompiledFile | null;
	mediaLinks?: string[];
	dataviewRevision?: never;
	datacoreRevision?: never;
};

export type DynamicQuartzSyncerCache = QuartzSyncerCacheBase & {
	dynamicSources: [string, ...string[]];
	localHash?: never;
	localData?: never;
	mediaLinks?: never;
	dataviewRevision?: number;
	datacoreRevision?: number;
};

export type UnclassifiedQuartzSyncerCache = QuartzSyncerCacheBase & {
	dynamicSources?: never;
	localHash?: never;
	localData?: never;
	mediaLinks?: never;
	dataviewRevision?: never;
	datacoreRevision?: never;
};

export type QuartzSyncerCache =
	| StaticQuartzSyncerCache
	| DynamicQuartzSyncerCache
	| UnclassifiedQuartzSyncerCache;

const isString = (value: unknown): value is string => typeof value === "string";

const isPositiveNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every(isString);

/**
 * Validate an untrusted cache record at the import boundary. A type assertion
 * cannot reject a dynamic record that carries a compiled payload, so imported
 * data is checked against the discriminated shape and dropped when malformed.
 */
export function parseImportedCacheEntry(
	value: unknown,
): QuartzSyncerCache | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}

	const entry = value as Record<string, unknown>;

	if (!isString(entry.version)) return null;
	if (typeof entry.time !== "number" || !Number.isFinite(entry.time)) {
		return null;
	}
	if (!isPositiveNumber(entry.sourceMtime)) return null;
	if (!isString(entry.settingsFingerprint)) return null;
	if (!isString(entry.detectorVersion)) return null;

	if (entry.remoteHash !== undefined && !isString(entry.remoteHash)) {
		return null;
	}

	const hasPayload =
		entry.localHash !== undefined ||
		entry.localData !== undefined ||
		entry.mediaLinks !== undefined;

	const hasRevisions =
		entry.dataviewRevision !== undefined ||
		entry.datacoreRevision !== undefined;

	if (entry.dynamicSources === undefined) {
		return hasPayload || hasRevisions
			? null
			: (entry as UnclassifiedQuartzSyncerCache);
	}

	if (!isStringArray(entry.dynamicSources)) return null;

	if (entry.dynamicSources.length === 0) {
		if (hasRevisions) return null;

		if (entry.localHash !== undefined && !isString(entry.localHash)) {
			return null;
		}

		if (
			entry.mediaLinks !== undefined &&
			!isStringArray(entry.mediaLinks)
		) {
			return null;
		}

		return entry as StaticQuartzSyncerCache;
	}

	if (hasPayload) return null;

	if (
		entry.dataviewRevision !== undefined &&
		typeof entry.dataviewRevision !== "number"
	) {
		return null;
	}

	if (
		entry.datacoreRevision !== undefined &&
		typeof entry.datacoreRevision !== "number"
	) {
		return null;
	}

	return entry as DynamicQuartzSyncerCache;
}

type QuartzSyncerCacheUpdates = {
	localHash?: string;
	remoteHash?: string;
	localData?: TCompiledFile | null;
	remoteData?: TCompiledFile | null;
	dynamicSources?: string[];
	dataviewRevision?: number;
	datacoreRevision?: number;
	mediaLinks?: string[];
	settingsFingerprint?: string;
	detectorVersion?: string;
};

export type CachedStatusMetadata = {
	localHash: string | null;
	mediaLinks: string[] | null;
	dynamicSources: string[] | null;
};

export type CompilationMetadata = {
	mediaLinks: string[];
};

export type CompilationCacheWrite = {
	localData: TCompiledFile;
	localHash: string;
	dynamicSources: string[];
	sourceMtime: number;
	currentMtime: number;
	settingsFingerprint: string;
	detectorVersion: string;
	verifiedRevisions?: CompilationRevisions;
	metadata?: CompilationMetadata;
};

/**
 * Simpler wrapper for a file-backed cache for arbitrary metadata.
 *
 * This class provides methods to store, retrieve, and manage metadata about files and sections
 * in the Quartz Syncer index.
 */
export class DataStore {
	public persister: IndexedDBStore;

	private readonly writeChains = new Map<string, Promise<unknown>>();

	/**
	 * Create a new DataStore instance for caching metadata about files and sections.
	 *
	 * IndexedDB is scoped per Obsidian installation, so the vault is identified
	 * by `appId` rather than its name: two vaults can share a folder name, and
	 * a shared cache would serve one vault's compiled output to the other.
	 *
	 * @param appId - Obsidian's per-vault identifier.
	 * @param pluginId - The plugin ID to namespace the cache under.
	 * @param version - The plugin version the cached data was written with.
	 * @param vaultName - Used solely to keep pre-db9905f vault-name-keyed caches reachable for cleanup.
	 * @param getSettings - Returns current settings, or undefined while they are unavailable.
	 */
	public constructor(
		public appId: string,
		public pluginId: string,
		public version: string,
		public vaultName: string = "",
		private readonly getSettings: () => QuartzSyncerSettings | undefined,
		private readonly getRevisions: typeof currentCompilationRevisions = currentCompilationRevisions,
	) {
		this.persister = createStore(this.storeName(version));
	}

	private storeName(version: string): string {
		return `quartz-syncer/cache/${this.appId}/${this.pluginId}/${version}`;
	}

	/**
	 * Get a cache entry from IndexedDB for single-path accessors.
	 */
	private async getCacheEntry(
		path: string,
		dynamicRead = false,
	): Promise<QuartzSyncerCache | null> {
		const key = this.fileKey(path);

		const data = await this.persister.getItem<QuartzSyncerCache>(key);
		if (perfMetricsEnabled) {
			const metrics = getPerfMetrics();
			if (dynamicRead) metrics?.recordDynamicCacheRead(data);
			else metrics?.recordCacheRead(data);
		}
		return data ?? null;
	}

	public getValidityCriteria(
		mtime: number,
		settings?: QuartzSyncerSettings,
	): CompiledEntryValidityCriteria {
		const effectiveSettings = settings ?? this.getSettings();
		if (!effectiveSettings) {
			throw new Error(
				"Cache validity requires current Quartz Syncer settings.",
			);
		}
		return {
			mtime,
			...this.getRevisions(),
			version: this.version,
			settingsFingerprint: settingsFingerprint(effectiveSettings),
			detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
		};
	}

	private waitForValidityCriteria(
		settings?: QuartzSyncerSettings,
	): boolean | Promise<boolean> {
		const effectiveSettings = settings ?? this.getSettings();
		return effectiveSettings
			? waitForSettingsFingerprintResolution(effectiveSettings)
			: false;
	}

	private isValid(
		data: QuartzSyncerCache | null | undefined,
		mtime: number,
		settings?: QuartzSyncerSettings,
	): data is QuartzSyncerCache {
		return isCompiledEntryValid(
			data,
			this.getValidityCriteria(mtime, settings),
		);
	}

	private isStructurallyValid(
		data: QuartzSyncerCache | null | undefined,
	): data is QuartzSyncerCache {
		if (!data || typeof data.settingsFingerprint !== "string") return false;
		if (data.version !== this.version) return false;
		if (typeof data.sourceMtime !== "number") return false;
		if (data.detectorVersion !== DYNAMIC_CONTENT_DETECTOR_VERSION)
			return false;
		if (data.dynamicSources === undefined) return true;
		// Remote metadata inspection only. Never use this self-derived check to
		// trust a local compiled payload, hash, classification, or media links.
		return isCompiledEntryValid(data, {
			mtime: data.sourceMtime,
			dataviewRevision: data.dataviewRevision,
			datacoreRevision: data.datacoreRevision,
			version: this.version,
			settingsFingerprint: data.settingsFingerprint,
			detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
		});
	}

	private async getCacheProperty<K extends keyof QuartzSyncerCache>(
		path: string,
		key: K,
	): Promise<QuartzSyncerCache[K] | null> {
		const data = await this.getCacheEntry(path);

		return this.isStructurallyValid(data) ? (data[key] ?? null) : null;
	}

	/**
	 * Store a cache entry to IndexedDB.
	 */
	private async setCacheEntry(
		path: string,
		data: QuartzSyncerCache,
	): Promise<void> {
		const key = this.fileKey(path);

		await this.persister.setItem(key, data);
	}

	/**
	 * Run a read-modify-write against one path with no other write interleaved,
	 * so a concurrent write cannot be lost between the read and the store.
	 */
	private serializeWrite<T>(
		path: string,
		work: () => Promise<T>,
	): Promise<T> {
		const previous = this.writeChains.get(path) ?? Promise.resolve();
		const run = previous.then(work, work);
		const settled = run.catch(() => undefined);
		this.writeChains.set(path, settled);

		void settled.then(() => {
			if (this.writeChains.get(path) === settled) {
				this.writeChains.delete(path);
			}
		});

		return run;
	}

	private async mergeAndStore(
		path: string,
		updates: QuartzSyncerCacheUpdates,
		sourceMtime: number,
		timestamp?: number,
		currentMtime?: number,
	): Promise<void> {
		if (!this.isUsableSourceMtime(sourceMtime)) return;
		const readiness = this.waitForValidityCriteria();
		const canValidateLocal =
			readiness === true
				? true
				: readiness === false
					? false
					: await readiness;
		await this.serializeWrite(path, async () => {
			const existing = await this.getCacheEntry(path);

			await this.setCacheEntry(
				path,
				this.mergeEntry(
					existing,
					updates,
					sourceMtime,
					timestamp,
					currentMtime,
					canValidateLocal,
				),
			);
		});
	}

	private mergeEntry(
		existing: QuartzSyncerCache | null,
		updates: QuartzSyncerCacheUpdates,
		sourceMtime: number,
		timestamp?: number,
		currentMtime?: number,
		canValidateLocal = true,
		preserveClassificationEvidence = true,
	): QuartzSyncerCache {
		if (!this.isUsableSourceMtime(sourceMtime)) {
			throw new Error("Cache writes require a positive source mtime.");
		}
		const remoteExisting = this.isStructurallyValid(existing)
			? existing
			: null;
		const criteria =
			canValidateLocal && currentMtime !== undefined
				? this.getValidityCriteria(currentMtime)
				: null;
		const classificationCriteria = canValidateLocal
			? this.getValidityCriteria(currentMtime ?? sourceMtime)
			: null;
		const classificationExisting =
			classificationCriteria &&
			isDynamicClassificationValid(existing, {
				...classificationCriteria,
				settingsFingerprint:
					updates.settingsFingerprint ??
					classificationCriteria.settingsFingerprint,
			})
				? existing
				: null;
		const localExisting =
			criteria &&
			isCompiledEntryValid(existing, {
				...criteria,
				settingsFingerprint:
					updates.settingsFingerprint ?? criteria.settingsFingerprint,
			})
				? existing
				: null;
		const dynamicSources =
			updates.dynamicSources ?? classificationExisting?.dynamicSources;
		const resolvedSettingsFingerprint =
			updates.settingsFingerprint ??
			(canValidateLocal
				? this.getValidityCriteria(sourceMtime).settingsFingerprint
				: remoteExisting?.settingsFingerprint);
		if (!resolvedSettingsFingerprint) {
			throw new Error(
				"Cache writes require current Quartz Syncer settings.",
			);
		}
		const base: QuartzSyncerCacheBase = {
			version: this.version,
			time: timestamp ?? Date.now(),
			sourceMtime,
			remoteData:
				updates.remoteData ?? remoteExisting?.remoteData ?? null,
			remoteHash: updates.remoteHash ?? remoteExisting?.remoteHash,
			settingsFingerprint: resolvedSettingsFingerprint,
			detectorVersion:
				updates.detectorVersion ?? DYNAMIC_CONTENT_DETECTOR_VERSION,
		};

		if (dynamicSources === undefined) return base;

		if (dynamicSources.length > 0) {
			return {
				...base,
				dynamicSources: [
					dynamicSources[0]!,
					...dynamicSources.slice(1),
				],
				dataviewRevision:
					updates.dataviewRevision ??
					(preserveClassificationEvidence &&
					classificationExisting?.dynamicSources?.length
						? classificationExisting.dataviewRevision
						: undefined),
				datacoreRevision:
					updates.datacoreRevision ??
					(preserveClassificationEvidence &&
					classificationExisting?.dynamicSources?.length
						? classificationExisting.datacoreRevision
						: undefined),
			};
		}

		const staticExisting =
			localExisting?.dynamicSources?.length === 0 ? localExisting : null;
		return {
			...base,
			dynamicSources: [],
			localData: updates.localData ?? staticExisting?.localData ?? null,
			localHash: updates.localHash ?? staticExisting?.localHash,
			mediaLinks: updates.mediaLinks ?? staticExisting?.mediaLinks,
		};
	}

	private isUsableSourceMtime(sourceMtime: number): boolean {
		return Number.isFinite(sourceMtime) && sourceMtime > 0;
	}

	public captureCompilationRevisions(): CompilationRevisions {
		return this.getRevisions();
	}

	/** Persist compiled output and its metadata together, reusing a caller's cache read. */
	public async storeCompilation(
		path: string,
		write: CompilationCacheWrite,
		existing?: QuartzSyncerCache | null,
	): Promise<void> {
		if (write.currentMtime !== write.sourceMtime) return;
		if (!this.isUsableSourceMtime(write.sourceMtime)) return;
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return;
		if (readiness !== true && !(await readiness)) return;

		const updates: QuartzSyncerCacheUpdates = {
			dynamicSources: write.dynamicSources,
			settingsFingerprint: write.settingsFingerprint,
			detectorVersion: write.detectorVersion,
		};
		if (write.dynamicSources.length === 0) {
			updates.localData = write.localData;
			updates.localHash = write.localHash;
			if (write.metadata) updates.mediaLinks = write.metadata.mediaLinks;
		} else if (write.verifiedRevisions) {
			const revisions = write.verifiedRevisions;
			if (
				write.dynamicSources.includes("dataview") &&
				revisions.dataviewRevision !== undefined
			)
				updates.dataviewRevision = revisions.dataviewRevision;
			if (
				write.dynamicSources.includes("datacore") &&
				revisions.datacoreRevision !== undefined
			)
				updates.datacoreRevision = revisions.datacoreRevision;
		}
		await this.serializeWrite(path, async () => {
			const entry =
				existing === undefined
					? await this.getCacheEntry(path)
					: existing;

			await this.setCacheEntry(
				path,
				this.mergeEntry(
					entry,
					updates,
					write.sourceMtime,
					write.metadata ? Date.now() : write.sourceMtime,
					write.currentMtime,
					true,
					false,
				),
			);
		});
	}

	/**
	 * Drop the entire cache instance and re-create a new fresh instance.
	 *
	 * @returns A promise that resolves when the cache is recreated.
	 */
	public async recreate() {
		const storeName = this.storeName(this.version);
		this.persister.close();
		await dropStore(storeName);
		await this.dropOutdatedCache();
		this.persister = createStore(storeName);
	}

	/**
	 * Drop outdated cache instance. This is used to clear the cache when the version changes.
	 *
	 * returns A promise that resolves when the cache is dropped.
	 */
	public async dropOutdatedCache(): Promise<void> {
		await dropStaleCaches({
			appId: this.appId,
			vaultName: this.vaultName,
			pluginId: this.pluginId,
			version: this.version,
		});
	}

	/**
	 * Check if a local file is outdated compared to the given timestamp and version.
	 *
	 * @param path - The file path to check for outdated status.
	 * @param currentMtime - The UNIX epoch time in milliseconds to compare against.
	 * @returns A promise that resolves to true if the local file is outdated, false otherwise.
	 */
	public async isLocalFileOutdated(
		path: string,
		currentMtime: number,
	): Promise<boolean> {
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return true;
		if (readiness !== true && !(await readiness)) return true;
		const data = await this.getCacheEntry(path);
		return !this.isValid(data, currentMtime) || !data.localData;
	}

	/**
	 * Check if the remote file is outdated compared to the current version.
	 *
	 * @param path - The file path to check for outdated status.
	 * @returns A promise that resolves to true if the remote file is outdated, false otherwise.
	 */
	public async isRemoteFileOutdated(path: string): Promise<boolean> {
		const data = await this.getCacheEntry(path);

		return !this.isStructurallyValid(data) || !data.remoteData;
	}

	/**
	 * Load a local file from the cache.
	 *
	 * @param path - The file path to load the local file for.
	 * @param currentMtime - The current file mtime to validate against.
	 * @returns A promise that resolves to the local file data, or null if not found.
	 */
	public async loadLocalFile(
		path: string,
		currentMtime: number,
	): Promise<TCompiledFile | null | undefined> {
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return null;
		if (readiness !== true && !(await readiness)) return null;
		const data = await this.getCacheEntry(path);
		return this.isValid(data, currentMtime) ? data.localData : null;
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

		return this.isStructurallyValid(data) ? data.remoteData : null;
	}

	/**
	 * Store a local file in the cache.
	 *
	 * @param path - The file path to store the local file for.
	 * @param sourceMtime - The UNIX epoch time in milliseconds to set for the data.
	 * @param data - The local file data to store.
	 * @param dynamicSources - Integration ids whose output depends on vault state.
	 * @param currentMtime - The current file mtime to validate against.
	 */
	public async storeLocalFile(
		path: string,
		sourceMtime: number,
		data: TCompiledFile,
		dynamicSources: string[],
		currentMtime: number,
	): Promise<void> {
		if (currentMtime !== sourceMtime) {
			return;
		}

		const localHash = await generateBlobHash(data[0]);

		await this.mergeAndStore(
			path,
			{
				localData: data,
				localHash,
				dynamicSources,
			},
			sourceMtime,
			sourceMtime,
			currentMtime,
		);
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
		currentMtime: number,
	): Promise<void> {
		await this.mergeAndStore(
			path,
			{
				remoteData: data,
			},
			currentMtime,
			timestamp,
			currentMtime,
		);
	}

	/**
	 * Load the local file hash from the cache.
	 *
	 * @param path - The file path to load the local hash for.
	 * @param currentMtime - The current file mtime to validate against.
	 * @returns A promise that resolves to the local hash, or null if not found.
	 */
	public async loadLocalHash(
		path: string,
		currentMtime: number,
	): Promise<string | null | undefined> {
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return null;
		if (readiness !== true && !(await readiness)) return null;
		const data = await this.getCacheEntry(path);
		return this.validLocalHash(data, currentMtime);
	}

	private validLocalHash(
		data: QuartzSyncerCache | null,
		currentMtime: number,
	): string | null {
		return this.isValid(data, currentMtime) && data.localHash
			? data.localHash
			: null;
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
		return this.getCacheProperty(path, "remoteHash");
	}

	/**
	 * Store a local file hash in the cache.
	 *
	 * @param path - The file path to store the local hash for.
	 * @param sourceMtime - The UNIX epoch time in milliseconds to set for the data.
	 * @param hash - The hash of the local file.
	 * @param dynamicSources - Integration ids whose output depends on vault state.
	 * @param currentMtime - The current file mtime to validate against.
	 */
	public async storeLocalHash(
		path: string,
		sourceMtime: number,
		hash: string,
		dynamicSources: string[],
		currentMtime: number,
	): Promise<void> {
		if (currentMtime !== sourceMtime) {
			return;
		}
		await this.mergeAndStore(
			path,
			{
				localHash: hash,
				dynamicSources,
			},
			sourceMtime,
			sourceMtime,
			currentMtime,
		);
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
		sourceMtime: number,
		currentMtime: number,
	): Promise<void> {
		await this.mergeAndStore(
			path,
			{
				remoteHash: hash,
			},
			sourceMtime,
			timestamp,
			sourceMtime === currentMtime ? currentMtime : undefined,
		);
	}

	public async storeMediaLinks(
		path: string,
		sourceMtime: number,
		links: string[],
		currentMtime: number,
	): Promise<void> {
		if (sourceMtime !== currentMtime) return;
		await this.mergeAndStore(
			path,
			{ mediaLinks: links },
			sourceMtime,
			undefined,
			currentMtime,
		);
	}

	/** Asset keys share the store, but never contain compiled files or bytes. */
	public async loadAssetShas(
		paths: string[],
	): Promise<Map<string, AssetShaCache>> {
		const entries = await this.persister.getMany<AssetShaCache>(
			paths.map((path) => `asset:${path}`),
		);
		const result = new Map<string, AssetShaCache>();
		paths.forEach((path, index) => {
			const entry = entries[index];
			if (
				entry &&
				Number.isFinite(entry.mtime) &&
				typeof entry.gitSha === "string" &&
				/^[0-9a-f]{40}$/.test(entry.gitSha)
			) {
				result.set(path, entry);
			}
		});
		return result;
	}

	public async storeAssetShas(
		entries: Map<string, AssetShaCache>,
	): Promise<void> {
		await this.persister.setMany(
			Array.from(entries, ([path, value]) => ({
				key: `asset:${path}`,
				value,
			})),
		);
	}

	/** Merge bounded batches before writing so publishing retains local cache fields. */
	public async storeRemoteHashes(
		entries: Array<{
			path: string;
			timestamp: number;
			hash: string;
			sourceMtime: number;
			currentMtime: number;
		}>,
	): Promise<void> {
		const readiness = this.waitForValidityCriteria();
		const canValidateLocal =
			readiness === true
				? true
				: readiness === false
					? false
					: await readiness;
		for (
			let offset = 0;
			offset < entries.length;
			offset += CACHE_WRITE_BATCH_SIZE
		) {
			const batch = entries.slice(
				offset,
				offset + CACHE_WRITE_BATCH_SIZE,
			);
			const keys = batch.map(({ path }) => this.fileKey(path));
			const existing =
				await this.persister.getMany<QuartzSyncerCache>(keys);
			const merged = new Map<string, QuartzSyncerCache>();
			batch.forEach(
				({ hash, timestamp, sourceMtime, currentMtime }, index) => {
					if (!this.isUsableSourceMtime(sourceMtime)) return;
					const key = keys[index]!;
					merged.set(
						key,
						this.mergeEntry(
							merged.get(key) ?? existing[index] ?? null,
							{ remoteHash: hash },
							sourceMtime,
							timestamp,
							sourceMtime === currentMtime
								? currentMtime
								: undefined,
							canValidateLocal,
						),
					);
				},
			);
			await this.persister.setMany(
				Array.from(merged, ([key, value]) => ({ key, value })),
			);
		}
	}

	public async loadMediaLinks(
		path: string,
		currentMtime: number,
	): Promise<string[]> {
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return [];
		if (readiness !== true && !(await readiness)) return [];
		const data = await this.getCacheEntry(path);
		return this.isValid(data, currentMtime) ? (data.mediaLinks ?? []) : [];
	}

	/** Returns null for missing or stale links; an empty array is a cache hit. */
	public async loadCachedMediaLinks(
		path: string,
		currentMtime: number,
	): Promise<string[] | null> {
		const readiness = this.waitForValidityCriteria();
		if (readiness === false) return null;
		if (readiness !== true && !(await readiness)) return null;
		const data = await this.getCacheEntry(path);
		return this.validMediaLinks(data, currentMtime);
	}

	private validMediaLinks(
		data: QuartzSyncerCache | null,
		currentMtime: number,
	): string[] | null {
		return this.isValid(data, currentMtime)
			? (data.mediaLinks ?? null)
			: null;
	}

	/** Read status metadata without retaining compiled content across batches. */
	public async loadStatusMetadata(
		files: Array<{ path: string; mtime: number }>,
	): Promise<Map<string, CachedStatusMetadata>> {
		const metadata = new Map<string, CachedStatusMetadata>();
		const readiness = this.waitForValidityCriteria();
		const resolved =
			readiness === true
				? true
				: readiness === false
					? false
					: await readiness;
		if (!resolved) {
			for (const { path } of files) {
				metadata.set(path, {
					localHash: null,
					mediaLinks: null,
					dynamicSources: null,
				});
			}
			return metadata;
		}

		for (
			let offset = 0;
			offset < files.length;
			offset += CACHE_READ_BATCH_SIZE
		) {
			const batch = files.slice(offset, offset + CACHE_READ_BATCH_SIZE);
			// Entries also contain full compiled files. Project each bounded
			// batch before reading the next, retaining only hashes and links.
			const entries = await this.persister.getMany<QuartzSyncerCache>(
				batch.map(({ path }) => this.fileKey(path)),
			);
			batch.forEach(({ path, mtime }, index) => {
				const data = entries[index] ?? null;
				const criteria = this.getValidityCriteria(mtime);
				const compiledValid = isCompiledEntryValid(data, criteria);
				const classificationValid = isDynamicClassificationValid(
					data,
					criteria,
				);
				metadata.set(path, {
					localHash:
						compiledValid && data?.localHash
							? data.localHash
							: null,
					mediaLinks: compiledValid
						? (data?.mediaLinks ?? null)
						: null,
					dynamicSources: classificationValid
						? [...data.dynamicSources]
						: null,
				});
			});
		}

		return metadata;
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
		currentMtime: number,
		settings?: QuartzSyncerSettings,
	): Promise<QuartzSyncerCache | null | undefined> {
		const readiness = this.waitForValidityCriteria(settings);
		if (readiness === false) return null;
		if (readiness !== true && !(await readiness)) return null;
		const data = await this.getCacheEntry(path);
		return this.isValid(data, currentMtime, settings) ? data : null;
	}

	/**
	 * Drop a file from the cache.
	 *
	 * @param path - The file path to drop from the cache.
	 * @returns A promise that resolves when the file is dropped.
	 */
	public async dropFile(path: string): Promise<void> {
		const key = this.fileKey(path);
		await this.persister.removeItem(key);
	}

	/**
	 * Drop all files in the cache.
	 *
	 * @returns A promise that resolves when all files are dropped.
	 */
	public async dropAllFiles(): Promise<void> {
		const keys = await this.allFiles();

		for (const key of keys) {
			await this.dropFile(key);
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
		for (const key of keys) {
			await this.dropFile(key);
		}

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
		const data: unknown = JSON.parse(cache);

		if (typeof data !== "object" || data === null) return;

		for (const [key, value] of Object.entries(data)) {
			const entry = parseImportedCacheEntry(value);
			if (!entry) continue;
			await this.persister.setItem(key, entry);
		}

		await this.setLastUpdateTimestamp(timestamp, plugin);
	}

	/**
	 * Export all cache entries as a JSON-serializable record.
	 * Side-effect-free: does not write to settings or IndexedDB.
	 */
	public async exportCache(): Promise<Record<string, QuartzSyncerCache>> {
		const data: Record<string, QuartzSyncerCache> = {};
		const keys = await this.allKeys();

		for (const key of keys) {
			if (!key.startsWith("file:")) continue;

			const value = await this.persister.getItem(key);

			if (value) {
				data[key] = value as QuartzSyncerCache;
			}
		}

		return data;
	}

	/**
	 * Import cache entries from a JSON record.
	 * Writes directly to IndexedDB. Does not touch plugin settings.
	 */
	public async importCache(
		data: Record<string, QuartzSyncerCache>,
	): Promise<number> {
		let count = 0;

		for (const [key, value] of Object.entries(data)) {
			if (!key.startsWith("file:")) continue;
			const entry = parseImportedCacheEntry(value);
			if (!entry) continue;
			await this.persister.setItem(key, entry);
			count += 1;
		}

		return count;
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
