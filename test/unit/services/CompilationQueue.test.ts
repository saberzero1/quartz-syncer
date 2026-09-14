import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompilationQueue } from "src/services/CompilationQueue";

describe("CompilationQueue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("limits concurrency to 3", async () => {
		let inFlight = 0;
		let maxConcurrent = 0;
		const resolvers: Array<() => void> = [];

		const queue = new CompilationQueue({
			processor: async () => {
				inFlight += 1;
				maxConcurrent = Math.max(maxConcurrent, inFlight);
				await new Promise<void>((resolve) => {
					resolvers.push(() => {
						inFlight -= 1;
						resolve();
					});
				});
			},
		});

		queue.enqueue("a");
		queue.enqueue("b");
		queue.enqueue("c");
		queue.enqueue("d");
		queue.enqueue("e");
		await vi.advanceTimersByTimeAsync(0);

		expect(queue.inFlightCount).toBe(3);
		while (queue.pendingCount > 0 || queue.inFlightCount > 0) {
			for (const resolve of resolvers.splice(0)) {
				resolve();
			}
			await vi.advanceTimersByTimeAsync(0);
		}

		expect(maxConcurrent).toBe(3);
	});

	it("cancels with AbortController", async () => {
		const queue = new CompilationQueue({
			processor: async (_path, signal) => {
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				});
			},
		});

		queue.enqueue("a");
		await vi.advanceTimersByTimeAsync(0);
		queue.cancel();
		await vi.advanceTimersByTimeAsync(0);
		await queue.onIdle();

		expect(queue.failedCount).toBe(1);
	});

	it("processes higher priority first", async () => {
		const order: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				order.push(path);
			},
		});

		queue.enqueue("low", 1);
		queue.enqueue("high", 3);
		queue.enqueue("mid", 2);
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(order).toEqual(["high", "mid", "low"]);
	});

	it("deduplicates by path with max priority", async () => {
		const order: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				order.push(path);
			},
		});

		queue.enqueue("a.md", 1);
		queue.enqueue("b.md", 2);
		queue.enqueue("a.md", 5);

		expect(queue.pendingCount).toBe(2);
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(order).toEqual(["a.md", "b.md"]);
	});

	it("has() returns true for queued paths", () => {
		const queue = new CompilationQueue();

		queue.enqueue("a.md");
		expect(queue.has("a.md")).toBe(true);
		expect(queue.has("b.md")).toBe(false);
	});

	it("does not process items while paused", async () => {
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);
			},
		});

		queue.pause();
		queue.enqueue("a.md");
		queue.enqueue("b.md");

		await vi.advanceTimersByTimeAsync(100);

		expect(processed).toEqual([]);
		expect(queue.pendingCount).toBe(2);
		expect(queue.isPaused).toBe(true);
	});

	it("processes items after resume", async () => {
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);
			},
		});

		queue.pause();
		queue.enqueue("a.md");
		queue.enqueue("b.md");

		queue.resume();
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(processed).toEqual(["a.md", "b.md"]);
		expect(queue.isPaused).toBe(false);
	});

	it("calls onStatusChange when items complete", async () => {
		const statusChanges: number[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async () => {},
			onStatusChange: () => {
				statusChanges.push(queue.pendingCount + queue.inFlightCount);
			},
		});

		queue.enqueue("a.md");
		queue.enqueue("b.md");
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(statusChanges.length).toBeGreaterThanOrEqual(2);
		expect(statusChanges[statusChanges.length - 1]).toBe(0);
	});

	it("calls onStatusChange when queue goes idle", async () => {
		const onStatusChange = vi.fn();
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async () => {},
			onStatusChange: () => {
				onStatusChange({
					pendingCount: queue.pendingCount,
					inFlightCount: queue.inFlightCount,
					isProcessing: queue.isProcessing,
				});
			},
		});

		queue.enqueue("a.md");
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(onStatusChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				pendingCount: 0,
				inFlightCount: 0,
				isProcessing: false,
			}),
		);
	});

	it("onIdle resolves after paused items are processed", async () => {
		let completed = 0;
		const queue = new CompilationQueue({
			concurrency: 3,
			processor: async () => {
				completed += 1;
			},
		});

		queue.pause();
		queue.enqueue("a.md");
		queue.enqueue("b.md");
		queue.enqueue("c.md");

		const idlePromise = queue.onIdle();
		queue.resume();
		await vi.advanceTimersByTimeAsync(100);
		await idlePromise;

		expect(completed).toBe(3);
	});

	it("does not process a path again while it is still in flight", async () => {
		let release: (() => void) | undefined;
		const started: string[] = [];

		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				started.push(path);
				await new Promise<void>((resolve) => {
					release = resolve;
				});
			},
		});

		queue.enqueue("notes/a.md");
		await vi.advanceTimersByTimeAsync(10);
		expect(started).toEqual(["notes/a.md"]);

		queue.enqueue("notes/a.md");
		expect(queue.pendingCount).toBe(0);
		expect(queue.has("notes/a.md")).toBe(true);

		release?.();
		await vi.advanceTimersByTimeAsync(100);

		expect(started).toEqual(["notes/a.md"]);
	});

	it("keeps priority-then-sequence ordering when sorting lazily", async () => {
		const processed: string[] = [];

		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);
			},
		});

		queue.pause();
		queue.enqueue("low-first", 0);
		queue.enqueue("high-first", 10);
		queue.enqueue("low-second", 0);
		queue.enqueue("high-second", 10);

		const idlePromise = queue.onIdle();
		queue.resume();
		await vi.advanceTimersByTimeAsync(100);
		await idlePromise;

		expect(processed).toEqual([
			"high-first",
			"high-second",
			"low-first",
			"low-second",
		]);
	});

	it("keeps equal-priority items FIFO when more arrive during processing", async () => {
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);

				if (path === "first") {
					queue.enqueue("fourth", 2);
					queue.enqueue("fifth", 2);
				}
			},
		});

		queue.enqueue("first", 2);
		queue.enqueue("second", 2);
		queue.enqueue("third", 2);
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(processed).toEqual([
			"first",
			"second",
			"third",
			"fourth",
			"fifth",
		]);
	});

	it("preempts a queued batch with higher-priority arrivals", async () => {
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);

				if (path === "batch-0") {
					queue.enqueue("urgent-first", 5);
					queue.enqueue("most-urgent", 10);
					queue.enqueue("urgent-second", 5);
					queue.enqueue("batch-20");
				}
			},
		});
		const batch = Array.from({ length: 20 }, (_, i) => `batch-${i}`);

		for (const path of batch) {
			queue.enqueue(path);
		}

		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(processed).toEqual([
			"batch-0",
			"most-urgent",
			"urgent-first",
			"urgent-second",
			...batch.slice(1),
			"batch-20",
		]);
	});

	it("preserves queuedPaths order before and after lazy sorting", async () => {
		let release: (() => void) | undefined;
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);

				if (path === "high-first") {
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				}
			},
		});

		queue.enqueue("low-first", 0);
		queue.enqueue("high-first", 10);
		queue.enqueue("low-second", 0);
		queue.enqueue("high-second", 10);
		expect(queue.queuedPaths).toEqual([
			"low-first",
			"high-first",
			"low-second",
			"high-second",
		]);

		queue.processQueue();
		expect(queue.queuedPaths).toEqual([
			"high-second",
			"low-first",
			"low-second",
		]);
		expect(queue.pendingCount).toBe(3);
		expect(queue.has("high-first")).toBe(true);

		queue.enqueue("middle", 5);
		queue.enqueue("low-second", 20);
		expect(queue.queuedPaths).toEqual([
			"high-second",
			"low-first",
			"low-second",
			"middle",
		]);

		release?.();
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(processed).toEqual([
			"high-first",
			"low-second",
			"high-second",
			"middle",
			"low-first",
		]);
		expect(queue.queuedPaths).toEqual([]);
	});

	it("keeps original sequence when a queued path is bumped to a peer's priority", async () => {
		const processed: string[] = [];
		let pendingAfterBump = 0;
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path) => {
				processed.push(path);

				if (path === "blocker") {
					queue.enqueue("earlier", 5);
					queue.enqueue("earlier", 2);
					queue.enqueue("peer", 0);
					queue.enqueue("blocker", 100);
					pendingAfterBump = queue.pendingCount;
				}
			},
		});

		queue.enqueue("earlier", 1);
		queue.enqueue("peer", 5);
		queue.enqueue("blocker", 10);
		queue.enqueue("last", 0);
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(pendingAfterBump).toBe(3);
		expect(processed).toEqual(["blocker", "earlier", "peer", "last"]);
	});

	it("fully clears queued state on cancel mid-drain and resolves idle after teardown", async () => {
		let release: (() => void) | undefined;
		let activeSignal: AbortSignal | undefined;
		const processed: string[] = [];
		const queue = new CompilationQueue({
			concurrency: 1,
			processor: async (path, signal) => {
				processed.push(path);

				if (path === "first") {
					activeSignal = signal;
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				}
			},
		});

		for (const path of ["first", "second", "third", "fourth"]) {
			queue.enqueue(path);
		}

		queue.processQueue();
		expect(queue["head"]).toBe(1);
		const idle = vi.fn();
		const idlePromise = queue.onIdle().then(idle);
		queue.cancel();

		expect(activeSignal?.aborted).toBe(true);
		expect(queue.pendingCount).toBe(0);
		expect(queue.queuedPaths).toEqual([]);
		expect(queue["queue"]).toHaveLength(0);
		expect(queue["head"]).toBe(0);
		expect(queue.has("second")).toBe(false);
		expect(queue.has("first")).toBe(true);
		expect(queue.inFlightCount).toBe(1);
		expect(queue.isProcessing).toBe(true);
		await Promise.resolve();
		expect(idle).not.toHaveBeenCalled();

		release?.();
		await vi.advanceTimersByTimeAsync(100);
		await idlePromise;
		expect(idle).toHaveBeenCalledOnce();
		expect(queue.inFlightCount).toBe(0);
		expect(queue.isProcessing).toBe(false);
		expect(queue.has("first")).toBe(false);
		expect(processed).toEqual(["first"]);

		queue.enqueue("second");
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();
		expect(processed).toEqual(["first", "second"]);
	});

	it("drains a 10,000-item equal-priority batch without sorting or shifting", () => {
		const queue = new CompilationQueue();
		queue.pause();
		const sort = vi.spyOn(Array.prototype, "sort");
		const shift = vi.spyOn(Array.prototype, "shift");
		let ordered = true;

		try {
			for (let i = 0; i < 10_000; i++) {
				queue.enqueue(`note-${i}`, 1);
			}

			for (let i = 0; i < 10_000; i++) {
				ordered &&= queue["takeNext"]()?.path === `note-${i}`;
			}

			expect(sort).not.toHaveBeenCalled();
			expect(shift).not.toHaveBeenCalled();
		} finally {
			sort.mockRestore();
			shift.mockRestore();
		}

		expect(ordered).toBe(true);
		expect(queue.pendingCount).toBe(0);
		expect(queue["queue"]).toHaveLength(0);
	});

	it("bounds backing storage and releases consumed slots during long push/pop cycles", () => {
		const queue = new CompilationQueue();
		queue.pause();

		for (let i = 0; i < 64; i++) {
			queue.enqueue(`note-${i}`);
		}

		// Exercise storage directly so timer/processor overhead cannot hide regressions.
		const sort = vi.spyOn(Array.prototype, "sort");
		const shift = vi.spyOn(Array.prototype, "shift");
		let maxLength = 0;
		let maxDeadPrefix = 0;
		let ordered = true;

		try {
			for (let i = 0; i < 10_000; i++) {
				const item = queue["takeNext"]();
				ordered &&= item?.path === `note-${i}`;
				queue.enqueue(`note-${i + 64}`);
				maxLength = Math.max(maxLength, queue["queue"].length);
				maxDeadPrefix = Math.max(maxDeadPrefix, queue["head"]);
			}

			expect(sort).not.toHaveBeenCalled();
			expect(shift).not.toHaveBeenCalled();
		} finally {
			sort.mockRestore();
			shift.mockRestore();
		}

		expect(ordered).toBe(true);
		// Consumed entries are released by compaction, not individually, so the
		// contract is bounded retention: the dead prefix never outgrows the live
		// set, capping the backing array at twice the live size.
		expect(maxDeadPrefix).toBeLessThanOrEqual(64);
		expect(maxLength).toBeLessThanOrEqual(128);
		expect(queue.pendingCount).toBe(64);
		expect(queue.queuedPaths).toEqual(
			Array.from({ length: 64 }, (_, i) => `note-${10_000 + i}`),
		);

		while (queue.pendingCount > 0) {
			queue["takeNext"]();
		}

		expect(queue["queue"]).toHaveLength(0);
		expect(queue["head"]).toBe(0);
		expect(queue.queuedPaths).toEqual([]);
		expect(queue.has("note-10063")).toBe(false);
	});
});
