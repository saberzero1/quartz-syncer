import { describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import type QuartzSyncer from "src/main";

const createPluginStub = (): QuartzSyncer => {
	return {
		getPublisher: () => ({
			refreshTreeCache: vi.fn().mockResolvedValue(undefined),
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

const createAutoPublishPluginStub = (
	publisherOverrides: Record<string, unknown> = {},
): QuartzSyncer => {
	return {
		getPublisher: () => ({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
			}),
			publishBatch: vi.fn().mockResolvedValue({ success: true }),
			deleteBatch: vi.fn().mockResolvedValue({ success: true }),
			cleanOrphanedMedia: vi.fn().mockResolvedValue(null),
			refreshTreeCache: vi.fn().mockResolvedValue(undefined),
			...publisherOverrides,
		}),
		settings: { useCache: true, autoCleanOrphanedMedia: false },
		dataStore: {
			dropFile: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
			hasDynamicContentFlag: vi.fn().mockResolvedValue(false),
			loadCompilationRevisions: vi.fn().mockResolvedValue({}),
			storeCompilationRevisions: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as QuartzSyncer;
};

const createPublisherStub = (overrides: Record<string, unknown> = {}) => {
	return {
		getPublishStatus: vi.fn().mockResolvedValue({
			unpublished: [],
			changed: [],
			published: [],
			deleted: [],
		}),
		publishBatch: vi.fn().mockResolvedValue({ success: true }),
		deleteBatch: vi.fn().mockResolvedValue({ success: true }),
		cleanOrphanedMedia: vi.fn().mockResolvedValue(null),
		refreshTreeCache: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
};

const createFile = (path: string, mtime: number): TFile => {
	const file = new TFile();
	file.path = path;
	file.extension = path.split(".").pop() ?? "";
	file.stat.mtime = mtime;
	return file;
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

	it("auto-publish runs on interval", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub();
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it("auto-publish publishes and deletes in one run", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: ["notes/a.md"],
				changed: ["notes/b.md"],
				published: [],
				deleted: ["notes/c.md"],
			}),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.publishBatch).toHaveBeenCalledWith(
			["notes/a.md", "notes/b.md"],
			"Auto-published via Quartz Syncer",
		);
		expect(publisher.deleteBatch).toHaveBeenCalledWith(
			["notes/c.md"],
			"Auto-deleted via Quartz Syncer",
		);
		vi.useRealTimers();
	});

	it("auto-publish skips when paused", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub();
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		engine.pauseAutoPublish();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("auto-publish prevents re-entrant runs", async () => {
		vi.useFakeTimers();
		const app = new App();
		let resolveStatus:
			| ((value: {
					unpublished: string[];
					changed: string[];
					published: string[];
					deleted: string[];
			  }) => void)
			| null = null;
		const statusPromise = new Promise<{
			unpublished: string[];
			changed: string[];
			published: string[];
			deleted: string[];
		}>((resolve) => {
			resolveStatus = resolve;
		});
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockReturnValue(statusPromise),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).toHaveBeenCalledTimes(1);
		if (!resolveStatus) {
			throw new Error("Missing status resolver");
		}
		resolveStatus({
			unpublished: [],
			changed: [],
			published: [],
			deleted: [],
		});
		await vi.runAllTicks();
		vi.useRealTimers();
	});

	it("auto-publish handles missing publisher", async () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => null;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(engine.isAutoPublishActive).toBe(true);
		vi.useRealTimers();
	});

	it("auto-publish resets flag after errors", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: ["notes/a.md"],
				changed: [],
				published: [],
				deleted: [],
			}),
			publishBatch: vi.fn().mockRejectedValue(new Error("boom")),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});

	it("auto-publish exits early with no pending changes", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
			}),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.publishBatch).not.toHaveBeenCalled();
		expect(publisher.deleteBatch).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("stopAutoPublish prevents future timer runs", async () => {
		vi.useFakeTimers();
		const app = new App();
		const publisher = createPublisherStub();
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		engine.stopAutoPublish();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("startAutoPublish clears previous timer", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const clearSpy = vi.spyOn(window, "clearInterval");

		engine.startAutoPublish(1);
		engine.startAutoPublish(2);

		expect(clearSpy).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it("startAutoPublish ignores intervals less than one minute", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const intervalSpy = vi.spyOn(window, "setInterval");

		engine.startAutoPublish(0);

		expect(intervalSpy).not.toHaveBeenCalled();
		expect(engine.isAutoPublishActive).toBe(false);
		vi.useRealTimers();
	});

	it("vault modify enqueues markdown file", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/test.md", Date.now());
		app.vault.trigger("modify", file);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/test.md", 5);
		vi.useRealTimers();
	});

	it("vault modify ignores non-markdown files", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/test.txt", Date.now());
		app.vault.trigger("modify", file);

		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault create enqueues new markdown file", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/new.md", Date.now());
		app.vault.trigger("create", file);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/new.md", 5);
		vi.useRealTimers();
	});

	it("vault delete drops cache", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/remove.md", Date.now());
		app.vault.trigger("delete", file);

		expect(plugin.dataStore.dropFile).toHaveBeenCalledWith(
			"notes/remove.md",
		);
		vi.useRealTimers();
	});

	it("vault rename drops old cache and enqueues new path", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/renamed.md", Date.now());
		app.vault.trigger("rename", file, "notes/old.md");

		expect(plugin.dataStore.dropFile).toHaveBeenCalledWith("notes/old.md");
		expect(enqueueSpy).toHaveBeenCalledWith("notes/renamed.md", 5);
		vi.useRealTimers();
	});

	it("vault rename to non-markdown file drops old cache but does not enqueue", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/renamed.txt", Date.now());
		app.vault.trigger("rename", file, "notes/old.md");

		expect(plugin.dataStore.dropFile).toHaveBeenCalledWith("notes/old.md");
		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault events during startup guard are ignored", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(10_000);

		const file = createFile("notes/startup.md", -1000);
		app.vault.trigger("modify", file);

		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault events after startup guard are processed", () => {
		vi.useFakeTimers();
		const app = new App();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/after-guard.md", Date.now());
		app.vault.trigger("modify", file);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/after-guard.md", 5);
		vi.useRealTimers();
	});
});
