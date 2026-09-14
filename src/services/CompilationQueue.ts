type QueueItem = {
	path: string;
	priority: number;
	sequence: number;
};

type CompilationQueueOptions = {
	concurrency?: number;
	processor?: (path: string, signal: AbortSignal) => Promise<void>;
	onStatusChange?: () => void;
};

export class CompilationQueue {
	private queue: QueueItem[] = [];
	private head = 0;
	private queued = new Map<string, QueueItem>();
	private inFlightPaths = new Set<string>();
	private needsSort = false;
	private inFlight = 0;
	private sequence = 0;
	private processing = false;
	private scheduled = false;
	private paused = false;
	private abortController: AbortController | null = null;
	private idleResolvers: Array<() => void> = [];

	readonly concurrency: number;
	completedCount = 0;
	failedCount = 0;

	private processor: (path: string, signal: AbortSignal) => Promise<void>;
	private onStatusChange: (() => void) | undefined;

	constructor(options: CompilationQueueOptions = {}) {
		this.concurrency = options.concurrency ?? 3;
		this.processor = options.processor ?? (async () => {});
		this.onStatusChange = options.onStatusChange;
	}

	enqueue(path: string, priority = 0): void {
		const existing = this.queued.get(path);

		if (existing) {
			if (priority > existing.priority) {
				existing.priority = priority;
				this.needsSort = true;
			}

			return;
		}

		// Re-queueing a path that is mid-compile would run the processor twice
		// for it concurrently.
		if (this.inFlightPaths.has(path)) return;

		const item = { path, priority, sequence: this.sequence++ };
		const last = this.queue[this.queue.length - 1];

		// Equal- or lower-priority appends preserve an already sorted tail.
		if (last && priority > last.priority) {
			this.needsSort = true;
		}

		this.queue.push(item);
		this.queued.set(path, item);
		this.schedule();
	}

	has(path: string): boolean {
		return this.queued.has(path) || this.inFlightPaths.has(path);
	}

	get queuedPaths(): string[] {
		return this.queue.slice(this.head).map((item) => item.path);
	}

	private takeNext(): QueueItem | undefined {
		if (this.needsSort) {
			this.queue = this.queue.slice(this.head);
			this.head = 0;
			this.queue.sort(
				(a, b) => b.priority - a.priority || a.sequence - b.sequence,
			);
			this.needsSort = false;
		}

		const item = this.queue[this.head];

		if (item) {
			this.head++;
			this.queued.delete(item.path);

			// Compact once the dead prefix matches the live tail. This keeps the
			// array packed, bounds retained storage to twice the live size, and
			// makes removal amortised O(1) instead of shift()'s reindexing.
			if (this.head * 2 >= this.queue.length) {
				this.queue = this.queue.slice(this.head);
				this.head = 0;
			}
		}

		return item;
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
		this.pump();
	}

	get isPaused(): boolean {
		return this.paused;
	}

	processQueue(): void {
		if (!this.processing) {
			this.processing = true;
			this.ensureAbortController();
		}
		this.pump();
	}

	private schedule(): void {
		if (this.scheduled) return;
		this.scheduled = true;
		window.setTimeout(() => {
			this.scheduled = false;
			this.processQueue();
		}, 0);
	}

	cancel(): void {
		this.queue = [];
		this.head = 0;
		this.queued.clear();
		this.needsSort = false;
		this.abortController?.abort();
	}

	onIdle(): Promise<void> {
		if (this.pendingCount === 0 && this.inFlight === 0) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.idleResolvers.push(resolve);
		});
	}

	get pendingCount(): number {
		return this.queue.length - this.head;
	}

	get inFlightCount(): number {
		return this.inFlight;
	}

	get isProcessing(): boolean {
		return this.processing;
	}

	private ensureAbortController(): AbortController {
		if (!this.abortController || this.abortController.signal.aborted) {
			this.abortController = new AbortController();
		}
		return this.abortController;
	}

	private pump(): void {
		if (this.paused) return;

		while (this.inFlight < this.concurrency && this.pendingCount > 0) {
			const item = this.takeNext();
			if (!item) break;
			this.inFlight += 1;
			this.inFlightPaths.add(item.path);
			void this.runItem(item);
		}

		if (this.pendingCount === 0 && this.inFlight === 0) {
			this.processing = false;
			this.abortController = null;
			this.resolveIdle();
		}
	}

	private async runItem(item: QueueItem): Promise<void> {
		try {
			await this.processor(
				item.path,
				this.ensureAbortController().signal,
			);
			this.completedCount += 1;
		} catch (error) {
			this.failedCount += 1;
			console.debug("Compilation failed for", item.path, error);
		} finally {
			this.inFlight -= 1;
			this.inFlightPaths.delete(item.path);
			this.onStatusChange?.();
			this.schedule();
		}
	}

	private resolveIdle(): void {
		this.onStatusChange?.();

		if (this.idleResolvers.length === 0) return;
		for (const resolve of this.idleResolvers) {
			resolve();
		}
		this.idleResolvers = [];
	}
}
