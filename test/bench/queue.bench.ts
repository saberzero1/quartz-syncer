import { expect, test } from "vitest";
import { CompilationQueue } from "src/services/CompilationQueue";
import { cpuOptions, markdownFiles, NOTE_COUNT, report } from "./fixtures";

for (const interleaved of [false, true]) {
	const name = interleaved
		? "CompilationQueue / interleaved batches of 10 / 10000"
		: "CompilationQueue / enqueue and drain 10000";
	test(name, async ({ bench }) => {
		let scheduled: (() => void) | undefined;
		// Only the queue's window scheduler is replaced, not Node timers or queue
		// methods. Yield to runItem promises after every real scheduled callback.
		const originalWindow = window;
		// Unit setup makes window writable but non-configurable, so change only
		// its value (vi.stubGlobal cannot redefine the descriptor).
		Object.defineProperty(globalThis, "window", {
			value: {
				setTimeout(callback: () => void) {
					if (scheduled)
						throw new Error("Unexpected duplicate queue timer");
					scheduled = callback;
					return 1;
				},
			},
		});
		async function pumpNext(): Promise<void> {
			const callback = scheduled;
			if (!callback) throw new Error("Expected queue timer");
			scheduled = undefined;
			callback();
			await Promise.resolve();
		}
		let queue = new CompilationQueue();
		let completedBeforeFinalDrain = 0;
		let pendingBeforeFinalDrain = 0;
		let enqueuedBatches = 0;
		try {
			const result = await bench(
				name,
				{
					async: true,
					afterEach: () => {
						expect(queue.completedCount).toBe(NOTE_COUNT);
						expect(queue.failedCount).toBe(0);
						expect(queue.pendingCount).toBe(0);
						expect(queue.inFlightCount).toBe(0);
						expect(queue.isProcessing).toBe(false);
						expect(queue.queuedPaths).toEqual([]);
						expect(scheduled).toBeUndefined();
						expect(enqueuedBatches).toBe(interleaved ? 1_000 : 1);
						expect(completedBeforeFinalDrain).toBe(
							interleaved ? 3_000 : 0,
						);
						expect(pendingBeforeFinalDrain).toBe(
							interleaved ? 7_000 : NOTE_COUNT,
						);
					},
				},
				async () => {
					queue = new CompilationQueue({ processor: async () => {} });
					enqueuedBatches = 0;
					if (interleaved) {
						for (
							let offset = 0;
							offset < NOTE_COUNT;
							offset += 10
						) {
							for (
								let index = offset;
								index < offset + 10;
								index++
							) {
								queue.enqueue(markdownFiles[index]!.path);
							}
							enqueuedBatches++;
							// One pump retires three items; the backlog grows by seven.
							// Do not drain the batch before enqueuing the next ten.
							await pumpNext();
						}
					} else {
						for (const file of markdownFiles)
							queue.enqueue(file.path);
						enqueuedBatches = 1;
					}
					completedBeforeFinalDrain = queue.completedCount;
					pendingBeforeFinalDrain = queue.pendingCount;
					const idle = queue.onIdle();
					let pumps = 0;
					while (scheduled) {
						await pumpNext();
						if (++pumps > NOTE_COUNT + 1)
							throw new Error("Queue failed to drain");
					}
					if (queue.pendingCount || queue.inFlightCount) {
						throw new Error(
							"Scheduler stopped before queue drained",
						);
					}
					await idle;
				},
			).run(cpuOptions);
			report(result, {
				kind: interleaved ? "queue-interleaved" : "queue-burst",
				completedCount: queue.completedCount,
				concurrency: queue.concurrency,
				enqueuedBatches,
				completedBeforeFinalDrain,
				pendingBeforeFinalDrain,
			});
		} finally {
			Object.defineProperty(globalThis, "window", {
				value: originalWindow,
			});
		}
	});
}
