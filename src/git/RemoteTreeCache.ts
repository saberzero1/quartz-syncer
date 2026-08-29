import type { GitBackend, TreeEntry } from "src/git/types";
import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";

export class RemoteTreeCache {
	private cache: TreeEntry[] | null = null;
	private cacheTime = 0;
	private fetchPromise: Promise<TreeEntry[]> | null = null;
	private timer: number | null = null;
	private store: IndexedDBStore | null = null;

	constructor(
		private gitBackend: GitBackend,
		private branch: string,
	) {}

	enablePersistence(vaultName: string, pluginId: string): void {
		this.store = createStore(`${vaultName}-${pluginId}-tree`);
	}

	async loadPersisted(): Promise<void> {
		if (!this.store || this.cache) return;

		const data = await this.store
			.getItem<{ entries: TreeEntry[]; time: number }>("tree")
			.catch(() => null);

		if (data) {
			this.cache = data.entries;
			this.cacheTime = data.time;
		}
	}

	async get(): Promise<TreeEntry[]> {
		if (this.cache) return this.cache;

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

		void this.refresh();

		this.timer = window.setInterval(() => {
			void this.refresh();
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

		await this.store
			.setItem("tree", {
				entries: this.cache,
				time: this.cacheTime,
			})
			.catch(() => {});
	}
}
