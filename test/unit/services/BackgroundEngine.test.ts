import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { BackgroundEngine } from "src/services/BackgroundEngine";

describe("BackgroundEngine", () => {
	it("starts and stops", () => {
		vi.useFakeTimers();
		const app = new App();
		const engine = new BackgroundEngine(app);

		expect(engine.isRunning).toBe(false);
		engine.start();
		vi.advanceTimersByTime(10000);
		expect(engine.isRunning).toBe(true);

		engine.stop();
		expect(engine.isRunning).toBe(false);
		vi.useRealTimers();
	});

	it("enqueue adds to queue", () => {
		const app = new App();
		const engine = new BackgroundEngine(app);
		const spy = vi
			.spyOn(engine as unknown as { processQueue: () => Promise<void> }, "processQueue")
			.mockResolvedValue();

		(engine as unknown as { enqueue: (path: string) => void }).enqueue(
			"notes/a.md",
		);

		expect(engine.pendingCount).toBe(1);
		spy.mockRestore();
	});

	it("processQueue drains queue", async () => {
		const app = new App();
		const engine = new BackgroundEngine(app);
		const state = engine as unknown as {
			queue: Set<string>;
			running: boolean;
			processQueue: () => Promise<void>;
		};

		state.running = true;
		state.queue.add("notes/a.md");
		state.queue.add("notes/b.md");

		await state.processQueue();
		expect(engine.pendingCount).toBe(0);
	});

	it("stop clears queue and aborts", () => {
		const app = new App();
		const engine = new BackgroundEngine(app);
		const state = engine as unknown as {
			queue: Set<string>;
			abortController: AbortController | null;
		};

		state.queue.add("notes/a.md");
		state.abortController = new AbortController();
		engine.stop();

		expect(engine.pendingCount).toBe(0);
		expect(state.abortController.signal.aborted).toBe(true);
	});
});
