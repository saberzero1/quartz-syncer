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
	private store: IndexedDBStore;

	private diffContentCache = new Map<
		string,
		{ local: string; remote: string }
	>();

	constructor(vaultName: string, pluginId: string) {
		this.store = createStore(`${vaultName}-${pluginId}-status`);
	}

	private get diffCacheLimit(): number {
		return Platform.isDesktopApp
			? DESKTOP_DIFF_CACHE_LIMIT
			: MOBILE_DIFF_CACHE_LIMIT;
	}

	async loadPersistedSnapshot(): Promise<void> {
		try {
			const data = await this.store.getItem<StatusSnapshot>(SNAPSHOT_KEY);

			if (data) {
				this.snapshot = data;
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

	setStatus(status: PublishStatus): void {
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
		void this.store.removeItem(SNAPSHOT_KEY).catch(() => {});
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

		await this.store.setItem(SNAPSHOT_KEY, snapshot).catch(() => {});
	}
}
