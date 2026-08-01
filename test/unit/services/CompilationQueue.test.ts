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
			onStatusChange,
		});

		queue.enqueue("a.md");
		await vi.advanceTimersByTimeAsync(100);
		await queue.onIdle();

		expect(onStatusChange).toHaveBeenCalled();
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
});
