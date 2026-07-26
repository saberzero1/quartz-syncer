type QueueItem = {
	path: string;
	priority: number;
	sequence: number;
};

type CompilationQueueOptions = {
	concurrency?: number;
	processor?: (path: string, signal: AbortSignal) => Promise<void>;
};

export class CompilationQueue {
	private queue: QueueItem[] = [];
	private inFlight = 0;
	private sequence = 0;
	private processing = false;
	private scheduled = false;
	private abortController: AbortController | null = null;
	private idleResolvers: Array<() => void> = [];

	readonly concurrency: number;
	completedCount = 0;
	failedCount = 0;

	private processor: (path: string, signal: AbortSignal) => Promise<void>;

	constructor(options: CompilationQueueOptions = {}) {
		this.concurrency = options.concurrency ?? 3;
		this.processor = options.processor ?? (async () => {});
	}

	enqueue(path: string, priority = 0): void {
		this.queue.push({ path, priority, sequence: this.sequence++ });
		this.queue.sort(
			(a, b) => b.priority - a.priority || a.sequence - b.sequence,
		);
		this.schedule();
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
		queueMicrotask(() => {
			this.scheduled = false;
			this.processQueue();
		});
	}

	cancel(): void {
		this.queue = [];
		this.abortController?.abort();
	}

	onIdle(): Promise<void> {
		if (this.queue.length === 0 && this.inFlight === 0) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.idleResolvers.push(resolve);
		});
	}

	get pendingCount(): number {
		return this.queue.length;
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
		while (this.inFlight < this.concurrency && this.queue.length > 0) {
			const item = this.queue.shift();
			if (!item) break;
			this.inFlight += 1;
			void this.runItem(item);
		}

		if (this.queue.length === 0 && this.inFlight === 0) {
			this.processing = false;
			this.abortController = null;
			this.resolveIdle();
		}
	}

	private async runItem(item: QueueItem): Promise<void> {
		try {
			await this.processor(item.path, this.ensureAbortController().signal);
			this.completedCount += 1;
		} catch {
			this.failedCount += 1;
		} finally {
			this.inFlight -= 1;
			this.pump();
		}
	}

	private resolveIdle(): void {
		if (this.idleResolvers.length === 0) return;
		for (const resolve of this.idleResolvers) {
			resolve();
		}
		this.idleResolvers = [];
	}
}
