import type { GitBackend, TreeEntry } from "src/git/types";
import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";

const PERSISTED_TREE_GENERATION = 1;
const PERSISTED_TREE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PersistedTree = {
	generation: number;
	remoteUrl: string;
	branch: string;
	entries: TreeEntry[];
	time: number;
};

export class RemoteTreeCache {
	private cache: TreeEntry[] | null = null;
	private cacheTime = 0;
	private fetchPromise: Promise<TreeEntry[]> | null = null;
	private timer: number | null = null;
	private store: IndexedDBStore | null = null;
	private remoteUrl = "";
	private loadPromise: Promise<void> | null = null;

	constructor(
		private gitBackend: GitBackend,
		private branch: string,
	) {}

	enablePersistence(
		vaultName: string,
		pluginId: string,
		remoteUrl: string,
	): void {
		this.store = createStore(`${vaultName}-${pluginId}-tree`);
		this.remoteUrl = remoteUrl;
	}

	private isUsable(data: PersistedTree | null): data is PersistedTree {
		if (!data || !Array.isArray(data.entries)) return false;

		// The store name is shared across repositories, so identity lives in
		// the record. Without this check a record written for a different
		// remote or branch is served as though it belonged to the current one.
		if (data.generation !== PERSISTED_TREE_GENERATION) return false;
		if (data.remoteUrl !== this.remoteUrl) return false;
		if (data.branch !== this.branch) return false;

		return Date.now() - data.time < PERSISTED_TREE_MAX_AGE_MS;
	}

	async loadPersisted(): Promise<void> {
		if (this.loadPromise) return this.loadPromise;
		if (!this.store || this.cache) return;

		this.loadPromise = (async () => {
			const data =
				(await this.store
					?.getItem<PersistedTree>("tree")
					.catch(() => null)) ?? null;

			if (this.cache) return;

			if (this.isUsable(data)) {
				this.cache = data.entries;
				this.cacheTime = data.time;

				return;
			}

			if (data) {
				await this.store?.removeItem("tree").catch(() => {});
			}
		})().finally(() => {
			this.loadPromise = null;
		});

		return this.loadPromise;
	}

	async get(): Promise<TreeEntry[]> {
		if (this.cache) return this.cache;

		if (this.loadPromise) {
			await this.loadPromise;

			if (this.cache) return this.cache;
		}

		return this.refresh();
	}

	async refresh(): Promise<TreeEntry[]> {
		if (this.fetchPromise) return this.fetchPromise;

		this.fetchPromise = this.gitBackend
			.readTree(this.branch)
			.then((entries) => {
				this.cache = entries;
				this.cacheTime = Date.now();
				void this.persist();
				return entries;
			})
			.finally(() => {
				this.fetchPromise = null;
			});

		return this.fetchPromise;
	}

	invalidate(): void {
		this.cache = null;
		this.cacheTime = 0;
		this.store?.removeItem("tree").catch(() => {});
	}

	removeEntries(paths: string[]): void {
		if (!this.cache) return;

		const toRemove = new Set(paths);
		this.cache = this.cache.filter((e) => !toRemove.has(e.path));
		this.cacheTime = Date.now();
		void this.persist();
	}

	get age(): number {
		if (!this.cache) return Infinity;

		return Date.now() - this.cacheTime;
	}

	get isCached(): boolean {
		return this.cache !== null;
	}

	startPeriodicFetch(intervalSeconds: number): void {
		this.stopPeriodicFetch();
		if (intervalSeconds < 1) return;

		void this.refresh().catch(() => {});

		this.timer = window.setInterval(() => {
			void this.refresh().catch(() => {});
		}, intervalSeconds * 1000);
	}

	stopPeriodicFetch(): void {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async persist(): Promise<void> {
		if (!this.store || !this.cache) return;

		const record: PersistedTree = {
			generation: PERSISTED_TREE_GENERATION,
			remoteUrl: this.remoteUrl,
			branch: this.branch,
			entries: this.cache,
			time: this.cacheTime,
		};

		await this.store.setItem("tree", record).catch(() => {});
	}
}
