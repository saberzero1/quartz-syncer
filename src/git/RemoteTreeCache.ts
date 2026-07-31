import type { GitBackend, TreeEntry } from "src/git/types";

export class RemoteTreeCache {
	private cache: TreeEntry[] | null = null;
	private cacheTime = 0;
	private fetchPromise: Promise<TreeEntry[]> | null = null;
	private timer: number | null = null;

	constructor(
		private gitBackend: GitBackend,
		private branch: string,
	) {}

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
}
