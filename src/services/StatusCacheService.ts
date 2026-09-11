import { Platform } from "obsidian";
import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";
import type {
	ArbitraryFileEntry,
	MediaEntry,
	PublishStatus,
} from "src/publisher/types";

const DESKTOP_DIFF_CACHE_LIMIT = 100;
const MOBILE_DIFF_CACHE_LIMIT = 20;

const SNAPSHOT_KEY = "status-snapshot";

export interface StatusSummary {
	unpublished: number;
	changed: number;
	published: number;
	deleted: number;
	media: number;
	timestamp: number;
}

export interface StatusSnapshot {
	/** Destination this snapshot was computed against. */
	destination: string;
	unpublished: string[];
	changed: string[];
	published: string[];
	deleted: string[];
	media: MediaEntry[];
	arbitrary: ArbitraryFileEntry[];
	mediaLinks: Record<string, string[]>;
	timestamp: number;
}

export class StatusCacheService {
	private cachedStatus: PublishStatus | null = null;
	private stale = true;
	private inflight: Promise<PublishStatus> | null = null;
	private snapshot: StatusSnapshot | null = null;
	private summary: StatusSummary | null = null;
	private destination = "none";
	private store: IndexedDBStore | null = null;
	private readonly storeName: string | null;

	private diffContentCache = new Map<
		string,
		{ local: string; remote: string }
	>();

	/**
	 * IndexedDB is shared across vaults in one Obsidian installation, so use
	 * `appId`: vault names are neither unique nor stable. A name-keyed cache
	 * could serve another vault's status or be orphaned after a vault rename.
	 */
	constructor(appId: string, pluginId: string) {
		this.storeName =
			appId && pluginId ? `${appId}-${pluginId}-status` : null;
	}

	private getStore(): IndexedDBStore | null {
		if (this.storeName === null) return null;
		if (this.store === null) this.store = createStore(this.storeName);
		return this.store;
	}

	private get diffCacheLimit(): number {
		return Platform.isDesktopApp
			? DESKTOP_DIFF_CACHE_LIMIT
			: MOBILE_DIFF_CACHE_LIMIT;
	}

	// Publish status is computed against one destination's file tree, so every
	// cached artifact is only valid for that destination. Switching targets
	// must not surface counts or diffs computed against the other one.
	setDestination(destination: string): void {
		if (destination === this.destination) return;

		this.destination = destination;
		this.cachedStatus = null;
		this.snapshot = null;
		this.summary = null;
		this.stale = true;
		this.inflight = null;
		this.clearDiffCache();
	}

	getDestination(): string {
		return this.destination;
	}

	async loadPersistedSnapshot(): Promise<void> {
		try {
			const data =
				await this.getStore()?.getItem<StatusSnapshot>(SNAPSHOT_KEY);

			if (data && data.destination === this.destination) {
				this.snapshot = data;
			} else {
				this.snapshot = null;
			}
		} catch {
			this.snapshot = null;
		}
	}

	getSnapshot(): StatusSnapshot | null {
		return this.snapshot;
	}

	getSummary(): StatusSummary | null {
		return this.summary;
	}

	setSummary(summary: StatusSummary): void {
		this.summary = summary;
	}

	getStatus(): PublishStatus | null {
		if (this.stale) return null;

		return this.cachedStatus;
	}

	getCachedStatusEvenIfStale(): PublishStatus | null {
		return this.cachedStatus;
	}

	isStale(): boolean {
		return this.stale;
	}

	// `destination` is the target the refresh started against; a result that
	// arrives after the user switched targets is discarded rather than shown.
	setStatus(status: PublishStatus, destination?: string): void {
		if (destination !== undefined && destination !== this.destination) {
			return;
		}

		this.cachedStatus = status;
		this.stale = false;
		void this.persistSnapshot(status);
	}

	markStale(): void {
		this.stale = true;
		this.clearDiffCache();
	}

	markStaleFile(path: string): void {
		this.stale = true;
		this.diffContentCache.delete(path);
	}

	patchPublished(publishedPaths: Set<string>): void {
		if (!this.cachedStatus) return;

		const remaining = {
			unpublished: this.cachedStatus.unpublished.filter(
				(f) => !publishedPaths.has(f.getVaultPath()),
			),
			changed: this.cachedStatus.changed.filter(
				(f) => !publishedPaths.has(f.getVaultPath()),
			),
		};

		const movedToPublished = [
			...this.cachedStatus.unpublished.filter((f) =>
				publishedPaths.has(f.getVaultPath()),
			),
			...this.cachedStatus.changed.filter((f) =>
				publishedPaths.has(f.getVaultPath()),
			),
		];

		this.cachedStatus = {
			...this.cachedStatus,
			unpublished: remaining.unpublished,
			changed: remaining.changed,
			published: [...this.cachedStatus.published, ...movedToPublished],
		};

		for (const path of publishedPaths) {
			this.diffContentCache.delete(path);
		}

		void this.persistSnapshot(this.cachedStatus);
	}

	patchDeleted(deletedPaths: Set<string>): void {
		if (!this.cachedStatus) return;

		this.cachedStatus = {
			...this.cachedStatus,
			published: this.cachedStatus.published.filter(
				(f) => !deletedPaths.has(f.getVaultPath()),
			),
			changed: this.cachedStatus.changed.filter(
				(f) => !deletedPaths.has(f.getVaultPath()),
			),
			deleted: this.cachedStatus.deleted.filter(
				(p) => !deletedPaths.has(p),
			),
		};

		for (const path of deletedPaths) {
			this.diffContentCache.delete(path);
		}

		void this.persistSnapshot(this.cachedStatus);
	}

	invalidate(): void {
		this.cachedStatus = null;
		this.snapshot = null;
		this.summary = null;
		this.stale = true;
		this.inflight = null;
		this.clearDiffCache();
		void this.getStore()
			?.removeItem(SNAPSHOT_KEY)
			.catch(() => {});
	}

	getInflight(): Promise<PublishStatus> | null {
		return this.inflight;
	}

	setInflight(promise: Promise<PublishStatus>): void {
		this.inflight = promise;
	}

	clearInflight(): void {
		this.inflight = null;
	}

	getDiffContent(
		path: string,
	): { local: string; remote: string } | undefined {
		return this.diffContentCache.get(path);
	}

	cacheDiffContent(path: string, local: string, remote: string): void {
		if (this.diffContentCache.size >= this.diffCacheLimit) {
			const firstKey = this.diffContentCache.keys().next().value;

			if (firstKey !== undefined) {
				this.diffContentCache.delete(firstKey);
			}
		}

		this.diffContentCache.set(path, { local, remote });
	}

	clearDiffCache(): void {
		this.diffContentCache.clear();
	}

	private async persistSnapshot(status: PublishStatus): Promise<void> {
		const snapshot: StatusSnapshot = {
			destination: this.destination,
			unpublished: status.unpublished.map((f) => f.getVaultPath()),
			changed: status.changed.map((f) => f.getVaultPath()),
			published: status.published.map((f) => f.getVaultPath()),
			deleted: [...status.deleted],
			media: status.media.map((m) => ({ ...m })),
			arbitrary: status.arbitrary.map((a) => ({ ...a })),
			mediaLinks: Object.fromEntries(status.mediaLinks ?? []),
			timestamp: Date.now(),
		};

		this.snapshot = snapshot;

		await this.getStore()
			?.setItem(SNAPSHOT_KEY, snapshot)
			.catch(() => {});
	}
}
