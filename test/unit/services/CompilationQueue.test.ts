import { describe, expect, it } from "vitest";
import { CompilationQueue } from "src/services/CompilationQueue";

describe("CompilationQueue", () => {
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
		await Promise.resolve();

		expect(queue.inFlightCount).toBe(3);
		while (queue.pendingCount > 0 || queue.inFlightCount > 0) {
			for (const resolve of resolvers.splice(0)) {
				resolve();
			}
			await Promise.resolve();
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
		await Promise.resolve();
		queue.cancel();
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
		await queue.onIdle();

		expect(order).toEqual(["high", "mid", "low"]);
	});
});
