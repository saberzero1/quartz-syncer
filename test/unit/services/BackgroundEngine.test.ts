import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import type QuartzSyncer from "src/main";

const createPluginStub = (): QuartzSyncer => {
	return {
		getPublisher: () => ({
			remoteTreeCache: {
				refresh: vi.fn().mockResolvedValue([]),
			},
		}),
		settings: { useCache: true },
		dataStore: {
			dropFile: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
			hasDynamicContentFlag: vi.fn().mockResolvedValue(false),
			loadCompilationRevisions: vi.fn().mockResolvedValue({}),
			storeCompilationRevisions: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as QuartzSyncer;
};

describe("BackgroundEngine", () => {
	it("starts and stops", () => {
		vi.useFakeTimers();
		const app = new App();
		const engine = new BackgroundEngine(app, createPluginStub());

		expect(engine.isRunning).toBe(false);
		engine.start();
		vi.advanceTimersByTime(10000);
		expect(engine.isRunning).toBe(true);

		engine.stop();
		expect(engine.isRunning).toBe(false);
		vi.useRealTimers();
	});

	it("exposes compilationQueue", () => {
		const app = new App();
		const engine = new BackgroundEngine(app, createPluginStub());

		expect(engine.compilationQueue).toBeDefined();
		expect(engine.compilationQueue.pendingCount).toBe(0);
	});

	it("stop cancels compilation queue", () => {
		const app = new App();
		const engine = new BackgroundEngine(app, createPluginStub());

		engine.compilationQueue.enqueue("notes/a.md");
		expect(engine.pendingCount).toBeGreaterThan(0);

		engine.stop();
		expect(engine.compilationQueue.pendingCount).toBe(0);
	});

	it("pendingCount reflects compilation queue", () => {
		const app = new App();
		const plugin = createPluginStub();
		const engine = new BackgroundEngine(app, plugin);

		engine.compilationQueue.pause();
		engine.compilationQueue.enqueue("notes/a.md");
		engine.compilationQueue.enqueue("notes/b.md");

		expect(engine.pendingCount).toBe(2);

		engine.stop();
	});
});
