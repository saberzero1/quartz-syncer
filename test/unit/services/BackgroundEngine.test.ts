import { afterEach, describe, expect, it, vi } from "vitest";
import { App, Events, Platform, TFile } from "obsidian";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import { PathMapper } from "src/git/PathMapper";
import type { TreeEntry } from "src/git/types";
import * as publishCandidates from "src/publishFile/PublishCandidates";
import type { Publisher } from "src/publisher/Publisher";
import type QuartzSyncer from "src/main";
import {
	disablePerfMetrics,
	enablePerfMetrics,
} from "src/operability/PerfMetrics";
import { createBackgroundCacheFixture } from "../../bench/background-cache-fixture";

const createPluginStub = (): QuartzSyncer => {
	return {
		getPublisher: () => ({
			refreshTreeCache: vi.fn().mockResolvedValue(undefined),
		}),
		settings: { useCache: true },
		dataStore: {
			dropFile: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
		},
		statusCache: {
			markStale: vi.fn(),
			markStaleFile: vi.fn(),
			invalidate: vi.fn(),
			clearDiffCache: vi.fn(),
			getSummary: vi.fn().mockReturnValue(null),
		},
		cacheHandle: null,
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
			beginDynamicSession: vi.fn(),
			endDynamicSession: vi.fn(),
			...publisherOverrides,
		}),
		settings: { useCache: true, autoCleanOrphanedMedia: false },
		dataStore: {
			dropFile: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
		},
		statusCache: {
			markStale: vi.fn(),
			markStaleFile: vi.fn(),
			invalidate: vi.fn(),
			clearDiffCache: vi.fn(),
			getSummary: vi.fn().mockReturnValue(null),
		},
		cacheHandle: null,
	} as unknown as QuartzSyncer;
};

const createPublisherStub = (
	overrides: Record<string, unknown> = {},
): Publisher => {
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
		beginDynamicSession: vi.fn(),
		endDynamicSession: vi.fn(),
		...overrides,
	} as unknown as Publisher;
};

const createFile = (path: string, mtime: number): TFile => {
	const file = new TFile();
	file.path = path;
	file.extension = path.split(".").pop() ?? "";
	file.stat.mtime = mtime;
	return file;
};

const createApp = (files: TFile[] = []): App => {
	const app = new App();
	const vaultStub = app.vault as typeof app.vault & {
		getFiles?: () => TFile[];
	};
	vaultStub.getFiles = vi.fn().mockReturnValue(files);
	app.vault.getFileByPath = vi.fn(
		(path: string) => files.find((file) => file.path === path) ?? null,
	);
	return app;
};

const createSummaryContext = (files: TFile[], tree: TreeEntry[] = []) => {
	const app = createApp(files);
	app.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);
	app.vault.getFileByPath = vi.fn(
		(path: string) => files.find((file) => file.path === path) ?? null,
	);
	const plugin = createPluginStub();
	plugin.settings = {
		...plugin.settings,
		vaultPath: "/",
		allNotesPublishableByDefault: true,
	};
	plugin.dataStore.loadLocalHash = vi.fn().mockResolvedValue(null);
	plugin.dataStore.loadStatusMetadata = vi.fn().mockResolvedValue(new Map());
	plugin.statusCache.setSummary = vi.fn();
	const pathMapper = new PathMapper("content");
	const publisher = createPublisherStub({
		getCachedTree: vi.fn().mockResolvedValue(tree),
		getPathMapper: () => pathMapper,
	});
	plugin.getPublisher = () => publisher;
	const engine = new BackgroundEngine(app, plugin);
	return { app, plugin, publisher, pathMapper, engine };
};

describe("BackgroundEngine", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts and stops", () => {
		vi.useFakeTimers();
		const app = createApp();
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
		const app = createApp();
		const engine = new BackgroundEngine(app, createPluginStub());

		expect(engine.compilationQueue).toBeDefined();
		expect(engine.compilationQueue.pendingCount).toBe(0);
	});

	it("stop cancels compilation queue", () => {
		const app = createApp();
		const engine = new BackgroundEngine(app, createPluginStub());

		engine.compilationQueue.enqueue("notes/a.md");
		expect(engine.pendingCount).toBeGreaterThan(0);

		engine.stop();
		expect(engine.compilationQueue.pendingCount).toBe(0);
	});

	it("pendingCount reflects compilation queue", () => {
		const app = createApp();
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
		const app = createApp();
		const publisher = createPublisherStub();
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.getPublishStatus).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it.each([
		{
			enabled: false,
			expected: ["notes/static.md"],
			label: "excludes dynamic notes by default",
		},
		{
			enabled: true,
			expected: ["notes/static.md", "notes/dynamic.md"],
			label: "includes dynamic notes when opted in",
		},
	])("auto-publish $label", async ({ enabled, expected }) => {
		vi.useFakeTimers();
		const app = createApp();
		const staticFile = {
			getVaultPath: () => "notes/static.md",
		} as unknown as PublishFile;
		const dynamicFile = {
			getVaultPath: () => "notes/dynamic.md",
		} as unknown as PublishFile;
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: [staticFile],
				changed: [dynamicFile],
				published: [],
				deleted: [],
				dynamic: new Set(["notes/dynamic.md"]),
			}),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		plugin.settings.autoPublishDynamicNotes = enabled;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		const published = vi.mocked(publisher.publishBatch).mock
			.calls[0]?.[0] as PublishFile[] | undefined;

		expect(published?.map((file) => file.getVaultPath())).toEqual(expected);
		vi.useRealTimers();
	});

	it("auto-publish publishes and deletes in one run", async () => {
		vi.useFakeTimers();
		const app = createApp();
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

	it("auto-clean still runs when there is nothing to publish or delete", async () => {
		vi.useFakeTimers();
		const app = createApp();
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
		plugin.settings.autoCleanOrphanedMedia = true;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		// Orphans are typically produced by the previous publish, so a quiet
		// vault is exactly when cleanup still needs to happen.
		expect(publisher.cleanOrphanedMedia).toHaveBeenCalledTimes(1);
		expect(publisher.publishBatch).not.toHaveBeenCalled();
		expect(publisher.deleteBatch).not.toHaveBeenCalled();

		engine.stop();
		vi.useRealTimers();
	});

	it("does not clean when the setting is disabled and nothing is pending", async () => {
		vi.useFakeTimers();
		const app = createApp();
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
		plugin.settings.autoCleanOrphanedMedia = false;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(publisher.cleanOrphanedMedia).not.toHaveBeenCalled();

		engine.stop();
		vi.useRealTimers();
	});

	it("auto-clean receives a lifecycle signal that stop() aborts", async () => {
		vi.useFakeTimers();
		const app = createApp();
		// Auto-clean sits behind the "nothing pending" early return, so the
		// status must be non-empty for the branch to be reached at all.
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: ["notes/a.md"],
				changed: [],
				published: [],
				deleted: [],
			}),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		plugin.settings.autoCleanOrphanedMedia = true;
		const engine = new BackgroundEngine(app, plugin);

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		const signal = vi.mocked(publisher.cleanOrphanedMedia).mock
			.calls[0]?.[0] as AbortSignal | undefined;

		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal?.aborted).toBe(false);

		engine.stop();

		// The queue cancel path does not reach auto-clean, so without the
		// lifecycle controller this stays false and cleanup runs on unload.
		expect(signal?.aborted).toBe(true);
		vi.useRealTimers();
	});

	it("restarting the engine issues a fresh, unaborted lifecycle signal", async () => {
		vi.useFakeTimers();
		const app = createApp();
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue({
				unpublished: ["notes/a.md"],
				changed: [],
				published: [],
				deleted: [],
			}),
		});
		const plugin = createAutoPublishPluginStub();
		plugin.getPublisher = () => publisher;
		plugin.settings.autoCleanOrphanedMedia = true;
		const engine = new BackgroundEngine(app, plugin);

		engine.start();
		engine.stop();
		engine.start();

		engine.startAutoPublish(1);
		await vi.advanceTimersByTimeAsync(60_000);

		const signal = vi.mocked(publisher.cleanOrphanedMedia).mock
			.calls[0]?.[0] as AbortSignal | undefined;

		expect(signal?.aborted).toBe(false);
		engine.stop();
		vi.useRealTimers();
	});

	it("auto-publish skips when paused", async () => {
		vi.useFakeTimers();
		const app = createApp();
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
		const app = createApp();
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
		const statusResolver =
			resolveStatus ??
			((_: {
				unpublished: string[];
				changed: string[];
				published: string[];
				deleted: string[];
			}) => {
				throw new Error("Missing status resolver");
			});
		statusResolver({
			unpublished: [],
			changed: [],
			published: [],
			deleted: [],
		});
		vi.runAllTicks();
		vi.useRealTimers();
	});

	it("auto-publish handles missing publisher", async () => {
		vi.useFakeTimers();
		const app = createApp();
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
		const app = createApp();
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
		const app = createApp();
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
		const app = createApp();
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
		const app = createApp();
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
		const app = createApp();
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
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/test.md", Date.now());
		app.vault.trigger("modify", file);
		vi.advanceTimersByTime(2_001);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/test.md", 5);
		vi.useRealTimers();
	});

	it("enqueues every file changed within one coalescing window", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const now = Date.now();
		app.vault.trigger("modify", createFile("notes/a.md", now));
		vi.advanceTimersByTime(200);
		app.vault.trigger("modify", createFile("notes/b.md", now));
		vi.advanceTimersByTime(200);
		app.vault.trigger("modify", createFile("notes/c.md", now));
		vi.advanceTimersByTime(2_001);

		const enqueued = enqueueSpy.mock.calls.map((call) => call[0]);
		expect(enqueued).toContain("notes/a.md");
		expect(enqueued).toContain("notes/b.md");
		expect(enqueued).toContain("notes/c.md");
		vi.useRealTimers();
	});

	it("vault modify ignores non-markdown files", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/test.txt", Date.now());
		app.vault.trigger("modify", file);
		vi.advanceTimersByTime(2_001);

		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault create enqueues new markdown file", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/new.md", Date.now());
		app.vault.trigger("create", file);
		vi.advanceTimersByTime(2_001);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/new.md", 5);
		vi.useRealTimers();
	});

	it("vault delete drops cache", () => {
		vi.useFakeTimers();
		const app = createApp();
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
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/renamed.md", Date.now());
		app.vault.trigger("rename", file, "notes/old.md");
		vi.advanceTimersByTime(2_001);

		expect(plugin.dataStore.dropFile).toHaveBeenCalledWith("notes/old.md");
		expect(enqueueSpy).toHaveBeenCalledWith("notes/renamed.md", 5);
		vi.useRealTimers();
	});

	it("vault rename to non-markdown file drops old cache but does not enqueue", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/renamed.txt", Date.now());
		app.vault.trigger("rename", file, "notes/old.md");
		vi.advanceTimersByTime(2_001);

		expect(plugin.dataStore.dropFile).toHaveBeenCalledWith("notes/old.md");
		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault events during startup guard are ignored", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(10_000);

		const file = createFile("notes/startup.md", -1000);
		app.vault.trigger("modify", file);
		vi.advanceTimersByTime(2_001);

		expect(enqueueSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("vault events after startup guard are processed", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/after-guard.md", Date.now());
		app.vault.trigger("modify", file);
		vi.advanceTimersByTime(2_001);

		expect(enqueueSpy).toHaveBeenCalledWith("notes/after-guard.md", 5);
		vi.useRealTimers();
	});

	it("vault delete marks statusCache stale for the file", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/removed.md", Date.now());
		app.vault.trigger("delete", file);

		expect(plugin.statusCache.markStaleFile).toHaveBeenCalledWith(
			"notes/removed.md",
		);
		vi.useRealTimers();
	});

	it("vault rename marks statusCache stale for both old and new paths", () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		const engine = new BackgroundEngine(app, plugin);

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		const file = createFile("notes/new-name.md", Date.now());
		app.vault.trigger("rename", file, "notes/old-name.md");
		vi.advanceTimersByTime(2_001);

		expect(plugin.statusCache.markStaleFile).toHaveBeenCalledWith(
			"notes/old-name.md",
		);
		expect(plugin.statusCache.markStaleFile).toHaveBeenCalledWith(
			"notes/new-name.md",
		);
		vi.useRealTimers();
	});

	it("does not enqueue anything into the compilation queue when useCache is false", () => {
		vi.useFakeTimers();
		const app = createApp([
			createFile("notes/a.md", 1000),
			createFile("notes/b.md", 1000),
		]);
		const plugin = createAutoPublishPluginStub();
		plugin.settings = { ...plugin.settings, useCache: false };
		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.start();
		vi.advanceTimersByTime(40_001);

		expect(enqueueSpy).not.toHaveBeenCalled();
		expect(engine.compilationQueue.pendingCount).toBe(0);
		vi.useRealTimers();
	});

	it("does not call dataStore.dropFile per-file during startup when useCache is false", () => {
		vi.useFakeTimers();
		const files = [
			createFile("notes/a.md", 1000),
			createFile("notes/b.md", 1000),
		];
		const app = createApp(files);
		const plugin = createAutoPublishPluginStub();
		plugin.settings = { ...plugin.settings, useCache: false };

		const engine = new BackgroundEngine(app, plugin);
		engine.start();
		vi.advanceTimersByTime(40_001);

		expect(plugin.dataStore.dropFile).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("counts a directly edited dynamic compile from source classification", async () => {
		vi.useFakeTimers({
			toFake: ["Date", "setTimeout", "clearTimeout"],
		});
		const fixture = createBackgroundCacheFixture(1, 1);
		const previousApp = window.app;
		Object.assign(window, {
			app: {
				plugins: {
					plugins: { dataview: { api: fixture.dataviewApi } },
				},
			},
		});
		const metrics = enablePerfMetrics();
		const engine = new BackgroundEngine(fixture.app, fixture.plugin);

		try {
			engine.start();
			await vi.advanceTimersByTimeAsync(40_001);
			metrics.reset();

			const dynamicFile = fixture.dynamicFiles[0]!;
			dynamicFile.stat.mtime = 2_000;
			fixture.app.vault.trigger("modify", dynamicFile);
			await vi.advanceTimersByTimeAsync(5_000);
			while (
				engine.compilationQueue.pendingCount > 0 ||
				engine.compilationQueue.inFlightCount > 0
			) {
				await vi.advanceTimersByTimeAsync(10);
			}

			const dump = metrics.dump();
			expect(dump.dynamicCompileStarts).toBe(1);
			expect(dump.dynamicCompileCompletions).toBe(1);
			expect(dump.staticCompileStarts).toBe(0);
			expect(dump.staticCompileCompletions).toBe(0);
		} finally {
			engine.stop();
			disablePerfMetrics();
			Object.assign(window, { app: previousApp });
		}
	});

	it("compiles a deferred active file once it is no longer active", async () => {
		const active = createFile("notes/active.md", 1000);
		const other = createFile("notes/other.md", 1000);
		const app = createApp([active, other]);
		// No active file when the listener registers, so `previousPath` stays
		// null and the active-leaf handler cannot re-queue the file on its own.
		app.workspace.getActiveFile = vi.fn().mockReturnValue(null);
		app.workspace.onLayoutReady = vi.fn((callback: () => void) =>
			callback(),
		);

		const plugin = createPluginStub();
		const engine = new BackgroundEngine(app, plugin);

		try {
			engine.start();

			const queue = engine["compilationQueue"] as CompilationQueue;

			app.workspace.getActiveFile = vi.fn().mockReturnValue(active);

			await engine["compileFile"](
				active.path,
				new AbortController().signal,
			);

			expect(queue.has(active.path)).toBe(false);

			app.workspace.getActiveFile = vi.fn().mockReturnValue(other);
			(app.workspace as Events).trigger("active-leaf-change");

			expect(queue.has(active.path)).toBe(true);
		} finally {
			engine.stop();
		}
	});

	describe("dynamic revision isolation", () => {
		type DynamicSource = "dataview" | "datacore";
		type Regime = "steady" | "post-invalidation" | "timeout";

		const cases = [
			["dataview", "steady"],
			["datacore", "steady"],
			["dataview", "post-invalidation"],
			["datacore", "post-invalidation"],
			["dataview", "timeout"],
			["datacore", "timeout"],
		] as const satisfies ReadonlyArray<readonly [DynamicSource, Regime]>;

		const triggerRevision = (
			fixture: ReturnType<typeof createBackgroundCacheFixture>,
			source: DynamicSource,
			revision: number,
			datacoreCore: { triggerUpdate(revision: number): void },
		): void => {
			if (source === "dataview") {
				(fixture.app.workspace as Events).trigger(
					"dataview:metadata-change",
					"update",
					fixture.staticFiles[0],
				);
				return;
			}
			datacoreCore.triggerUpdate(revision);
		};

		it.each(cases)(
			"%s %s revision performs zero fan-out work and preserves static compilation",
			async (source, regime) => {
				vi.useFakeTimers({
					toFake: ["Date", "setTimeout", "clearTimeout"],
				});
				const previousApp = window.app;
				const windowWithDatacore = window as typeof window & {
					datacore?: unknown;
				};
				const previousDatacore = windowWithDatacore.datacore;
				Object.assign(window, {
					app: {
						plugins: {
							plugins: { dataview: { settings: {} } },
						},
					},
				});
				const fixture = createBackgroundCacheFixture(
					regime === "steady"
						? 3
						: regime === "post-invalidation"
							? 2
							: 0,
					regime === "post-invalidation" || regime === "timeout"
						? 3
						: 1,
				);
				const dataviewPlugin =
					regime === "timeout" ? {} : { api: fixture.dataviewApi };
				let datacoreUpdate: ((revision: number) => void) | undefined;
				const datacoreCore = {
					revision: 2,
					on: vi.fn(
						(
							event: string,
							callback: (revision: number) => void,
						) => {
							if (event === "update") datacoreUpdate = callback;
							return fixture.app.workspace.on(
								"window-open",
								() => undefined,
							);
						},
					),
					offref: vi.fn(),
					triggerUpdate(revision: number): void {
						datacoreUpdate?.(revision);
					},
				};
				Object.assign(window, {
					app: {
						plugins: { plugins: { dataview: dataviewPlugin } },
					},
					datacore: {
						core: datacoreCore,
						executeJs: vi.fn(),
						executeJsx: vi.fn(),
						executeTs: vi.fn(),
						executeTsx: vi.fn(),
					},
				});

				if (source === "datacore") {
					for (const file of fixture.dynamicFiles) {
						const entry = fixture.persister.values.get(
							`file:${file.path}`,
						);
						if (entry && typeof entry === "object") {
							fixture.persister.values.set(`file:${file.path}`, {
								...entry,
								dynamicSources: ["datacore"],
								dataviewRevision: undefined,
								datacoreRevision: 1,
							});
						}
					}
				}

				if (regime === "post-invalidation") {
					for (const file of fixture.staticFiles) {
						const key = `file:${file.path}`;
						const entry = fixture.persister.values.get(key);
						if (entry && typeof entry === "object") {
							fixture.persister.values.set(key, {
								...entry,
								detectorVersion: "invalidated",
							});
						}
					}
				}

				const metrics = enablePerfMetrics();
				const engine = new BackgroundEngine(
					fixture.app,
					fixture.plugin,
				);

				try {
					engine.start();
					await vi.advanceTimersByTimeAsync(40_001);
					metrics.reset();

					triggerRevision(fixture, source, 2, datacoreCore);
					await vi.advanceTimersByTimeAsync(5_000);
					if (regime === "timeout") {
						triggerRevision(fixture, source, 3, datacoreCore);
						await vi.advanceTimersByTimeAsync(5_000);
					}

					const revisionDump = metrics.dump();
					expect(revisionDump.dynamicPathsExamined).toBe(0);
					expect(revisionDump.dynamicCacheReads).toBe(0);
					expect(revisionDump.enqueueAttempts).toBe(0);
					expect(revisionDump.dynamicCompileStarts).toBe(0);
					expect(revisionDump.dynamicCompileCompletions).toBe(0);
					if (regime === "post-invalidation") {
						for (const file of fixture.staticFiles) {
							const key = `file:${file.path}`;
							const entry = fixture.persister.values.get(key);
							if (entry && typeof entry === "object") {
								fixture.persister.values.set(key, {
									...entry,
									detectorVersion: "vault-dependencies-v2",
								});
							}
						}
						metrics.reset();
						triggerRevision(fixture, source, 3, datacoreCore);
						await vi.advanceTimersByTimeAsync(5_000);
						const convergedDump = metrics.dump();
						expect(convergedDump.dynamicPathsExamined).toBe(0);
						expect(convergedDump.dynamicCacheReads).toBe(0);
						expect(convergedDump.enqueueAttempts).toBe(0);
						expect(convergedDump.dynamicCompileStarts).toBe(0);
						expect(convergedDump.dynamicCompileCompletions).toBe(0);
					}

					if (regime === "timeout") {
						Object.assign(window, {
							app: {
								plugins: {
									plugins: {
										dataview: { api: fixture.dataviewApi },
									},
								},
							},
						});
					}
					metrics.reset();
					fixture.modifyUnrelatedStaticNote();
					await vi.advanceTimersByTimeAsync(5_000);
					while (
						engine.compilationQueue.pendingCount > 0 ||
						engine.compilationQueue.inFlightCount > 0
					) {
						await vi.advanceTimersByTimeAsync(10);
					}

					const staticDump = metrics.dump();
					expect(staticDump.enqueueAttempts).toBe(1);
					expect(staticDump.staticCompileStarts).toBe(1);
					expect(staticDump.staticCompileCompletions).toBe(1);
					expect(staticDump.dynamicCompileStarts).toBe(0);
					expect(staticDump.dynamicCompileCompletions).toBe(0);
				} finally {
					engine.stop();
					disablePerfMetrics();
					Object.assign(window, {
						app: previousApp,
						datacore: previousDatacore,
					});
					vi.useRealTimers();
				}
			},
		);
	});

	it("remains idle across a bounded polling window without vault activity", async () => {
		vi.useFakeTimers({
			toFake: [
				"Date",
				"setTimeout",
				"clearTimeout",
				"setInterval",
				"clearInterval",
			],
		});
		const previousApp = window.app;
		const fixture = createBackgroundCacheFixture(3, 1);
		Object.assign(window, {
			app: {
				plugins: {
					plugins: { dataview: { api: fixture.dataviewApi } },
				},
			},
		});
		const metrics = enablePerfMetrics();
		const engine = new BackgroundEngine(fixture.app, fixture.plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		try {
			engine.start();
			await vi.advanceTimersByTimeAsync(40_001);
			metrics.reset();
			enqueueSpy.mockClear();

			await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

			const dump = metrics.dump();
			expect(dump.dynamicPathsExamined).toBe(0);
			expect(dump.dynamicCacheReads).toBe(0);
			expect(dump.enqueueAttempts).toBe(0);
			expect(dump.dynamicCompileStarts).toBe(0);
			expect(dump.dynamicCompileCompletions).toBe(0);
			expect(dump.dynamicScanMs).toBe(0);
			expect(enqueueSpy).not.toHaveBeenCalled();
		} finally {
			engine.stop();
			disablePerfMetrics();
			Object.assign(window, { app: previousApp });
		}
	});

	describe("dynamic listener removal", () => {
		type Source = "dataview" | "datacore";

		const triggerSource = (app: App, source: Source): void => {
			if (source === "dataview") {
				(app.workspace as Events).trigger(
					"dataview:metadata-change",
					"update",
					createFile("notes/changed.md", Date.now()),
				);
				return;
			}
			(app.workspace as Events).trigger("update", 2);
		};

		it.each([
			["dataview", true],
			["dataview", false],
			["datacore", true],
			["datacore", false],
		] as const)(
			"does not register a %s listener when useCache=%s",
			(source, useCache) => {
				vi.useFakeTimers();
				const app = createApp();
				const plugin = createPluginStub();
				plugin.settings.useCache = useCache;
				const dataviewOn = vi.fn();
				app.metadataCache.on = dataviewOn;
				const datacoreOn = vi.fn();
				const previousDatacore = (
					window as typeof window & { datacore?: unknown }
				).datacore;
				Object.assign(window, {
					datacore: {
						core: { revision: 2, on: datacoreOn, offref: vi.fn() },
					},
				});
				const engine = new BackgroundEngine(app, plugin);

				try {
					engine.start();
					expect(
						source === "dataview" ? dataviewOn : datacoreOn,
					).not.toHaveBeenCalled();
				} finally {
					engine.stop();
					Object.assign(window, { datacore: previousDatacore });
				}
			},
		);

		it.each(["dataview", "datacore"] as const)(
			"a %s revision does not enumerate vault files",
			(source) => {
				vi.useFakeTimers();
				const app = createApp([createFile("notes/dynamic.md", 1000)]);
				const engine = new BackgroundEngine(app, createPluginStub());
				engine.start();
				vi.mocked(app.vault.getFiles).mockClear();

				triggerSource(app, source);

				expect(app.vault.getFiles).not.toHaveBeenCalled();
				engine.stop();
			},
		);

		it.each([
			["dataview", true],
			["dataview", false],
			["datacore", true],
			["datacore", false],
		] as const)(
			"a %s revision performs no classification reads when useCache=%s",
			(source, useCache) => {
				vi.useFakeTimers();
				const app = createApp([createFile("notes/dynamic.md", 1000)]);
				const plugin = createPluginStub();
				plugin.settings.useCache = useCache;
				const engine = new BackgroundEngine(app, plugin);
				const metrics = enablePerfMetrics();
				try {
					engine.start();
					triggerSource(app, source);

					expect(metrics.dump().dynamicCacheReads).toBe(0);
				} finally {
					engine.stop();
					disablePerfMetrics();
				}
			},
		);

		it.each(["dataview", "datacore"] as const)(
			"a %s revision does not enqueue compilation",
			(source) => {
				vi.useFakeTimers();
				const app = createApp([createFile("notes/dynamic.md", 1000)]);
				const engine = new BackgroundEngine(app, createPluginStub());
				const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");
				engine.start();

				triggerSource(app, source);

				expect(enqueueSpy).not.toHaveBeenCalled();
				engine.stop();
			},
		);

		it.each(["dataview", "datacore"] as const)(
			"a %s revision remains inert after engine stop",
			(source) => {
				vi.useFakeTimers();
				const app = createApp([createFile("notes/dynamic.md", 1000)]);
				const engine = new BackgroundEngine(app, createPluginStub());
				const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");
				engine.start();
				engine.stop();

				triggerSource(app, source);

				expect(enqueueSpy).not.toHaveBeenCalled();
			},
		);
	});

	it.each([
		[false, false],
		[false, true],
		[true, false],
		[true, true],
	])(
		"startup does not enqueue the vault (useCache=%s, allNotesPublishableByDefault=%s)",
		async (useCache, allNotesPublishableByDefault) => {
			vi.useFakeTimers();
			const files = Array.from({ length: 10_001 }, (_, index) =>
				createFile(`notes/published-${index}.md`, 1000),
			);
			const app = createApp(files);
			app.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);
			app.metadataCache.getFileCache = vi.fn().mockReturnValue({
				frontmatter: { publish: true },
			});
			const plugin = createPluginStub();
			plugin.settings = {
				...plugin.settings,
				useCache,
				allNotesPublishableByDefault,
				publishFrontmatterKey: "publish",
			};
			const engine = new BackgroundEngine(app, plugin);
			const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");
			engine.compilationQueue.pause();

			try {
				engine.start();
				await vi.advanceTimersByTimeAsync(60_000);

				expect(enqueueSpy).not.toHaveBeenCalled();
				expect(engine.pendingCount).toBe(0);
				expect(app.vault.getFiles).not.toHaveBeenCalled();
			} finally {
				engine.stop();
			}
		},
	);

	it("startup leaves both publishable notes and drafts uncompiled", () => {
		vi.useFakeTimers();

		const publishedFile = createFile("notes/published.md", 1000);
		const draftFile = createFile("notes/draft.md", 2000);
		const app = createApp([publishedFile, draftFile]);

		const vaultStub = app.vault as typeof app.vault & {
			getMarkdownFiles?: () => ReturnType<typeof createFile>[];
			getFiles?: () => ReturnType<typeof createFile>[];
		};
		vaultStub.getMarkdownFiles = vi
			.fn()
			.mockReturnValue([publishedFile, draftFile]);
		vaultStub.getFiles = vi
			.fn()
			.mockReturnValue([publishedFile, draftFile]);

		const metaStub = app.metadataCache as typeof app.metadataCache & {
			getFileCache?: (
				file: TFile,
			) => { frontmatter: Record<string, unknown> } | null;
		};
		metaStub.getFileCache = vi
			.fn()
			.mockImplementation((file: TFile) =>
				file.path === "notes/published.md"
					? { frontmatter: { publish: true } }
					: null,
			);

		const plugin = createAutoPublishPluginStub();
		plugin.settings = { ...plugin.settings, useCache: true };

		const engine = new BackgroundEngine(app, plugin);
		const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");

		engine.compilationQueue.pause();
		engine.start();
		vi.advanceTimersByTime(40_001);

		expect(enqueueSpy).not.toHaveBeenCalled();
		expect(engine.pendingCount).toBe(0);
		engine.stop();
		vi.useRealTimers();
	});

	it("fetches the initial tree without a queue drain and only once", async () => {
		vi.useFakeTimers();
		const { engine, publisher, plugin } = createSummaryContext([]);
		let finishFetch = () => {};
		vi.mocked(publisher.refreshTreeCache).mockReturnValue(
			new Promise<void>((resolve) => {
				finishFetch = resolve;
			}),
		);

		try {
			engine.start();
			expect(engine.pendingCount).toBe(0);
			expect(engine.compilationQueue.completedCount).toBe(0);
			expect(publisher.refreshTreeCache).toHaveBeenCalledTimes(1);

			// Repeated starts and idle callbacks must not duplicate an in-flight fetch.
			engine.start();
			engine.compilationQueue.processQueue();
			expect(publisher.refreshTreeCache).toHaveBeenCalledTimes(1);

			// Activity after the fetch starts must not hold up the initial summary.
			engine.compilationQueue.pause();
			engine.compilationQueue.enqueue("notes/later.md");
			finishFetch();
			await vi.runAllTimersAsync();
			expect(engine.pendingCount).toBe(1);
			expect(plugin.statusCache.setSummary).toHaveBeenCalledTimes(1);

			engine.compilationQueue.resume();
			await vi.runAllTimersAsync();
			expect(publisher.refreshTreeCache).toHaveBeenCalledTimes(1);
		} finally {
			engine.stop();
		}
	});

	it("defers the initial fetch when startup finds a busy queue", async () => {
		vi.useFakeTimers();
		const { engine, publisher, plugin } = createSummaryContext([]);
		engine.compilationQueue.pause();
		engine.compilationQueue.enqueue("notes/pending.md");

		try {
			engine.start();
			await vi.runAllTimersAsync();
			expect(publisher.refreshTreeCache).not.toHaveBeenCalled();

			engine.compilationQueue.resume();
			await vi.runAllTimersAsync();
			expect(publisher.refreshTreeCache).toHaveBeenCalledTimes(1);
			expect(plugin.statusCache.setSummary).toHaveBeenCalledTimes(1);
		} finally {
			engine.stop();
		}
	});

	it("only strips vaultPath on a path boundary in the summary", async () => {
		vi.useFakeTimers();
		const files = [
			createFile("notes/a.md", 1000),
			createFile("notes-old/a.md", 1000),
		];
		const { engine, plugin, pathMapper } = createSummaryContext(files);
		plugin.settings.vaultPath = "notes";
		// Isolate summary mapping from the candidate collector's own scope filter.
		const candidatesSpy = vi
			.spyOn(publishCandidates, "collectCandidatePaths")
			.mockReturnValue(new Set(files.map((file) => file.path)));
		const mapSpy = vi.spyOn(pathMapper, "toRepoPath");

		try {
			engine.start();
			await vi.runAllTimersAsync();
			expect(mapSpy.mock.calls).toEqual([["a.md"], ["notes-old/a.md"]]);
			expect(plugin.statusCache.setSummary).toHaveBeenCalledWith({
				unpublished: 2,
				changed: 0,
				published: 0,
				deleted: 0,
				media: 0,
				timestamp: expect.any(Number),
			});
		} finally {
			engine.stop();
			candidatesSpy.mockRestore();
		}
	});

	it.each(["/", "", "."])(
		"preserves whole-vault paths in the summary for vaultPath=%s",
		async (vaultPath) => {
			vi.useFakeTimers();
			const { engine, plugin, pathMapper } = createSummaryContext([
				createFile("notes/a.md", 1000),
			]);
			plugin.settings.vaultPath = vaultPath;
			const mapSpy = vi.spyOn(pathMapper, "toRepoPath");

			try {
				engine.start();
				await vi.runAllTimersAsync();
				expect(mapSpy).toHaveBeenCalledWith("notes/a.md");
				expect(plugin.statusCache.setSummary).toHaveBeenCalledTimes(1);
			} finally {
				engine.stop();
			}
		},
	);

	it.each([false, true])(
		"batches hash reads without changing summary counts (mobile=%s)",
		async (isMobile) => {
			vi.useFakeTimers();
			const wasMobile = Platform.isMobileApp;
			Platform.isMobileApp = isMobile;
			const files = Array.from({ length: 13 }, (_, index) =>
				createFile(`notes/${index}.md`, 1000 + index),
			);
			const tree: TreeEntry[] = files.slice(0, 12).map((file, index) => ({
				path: `content/${file.path}`,
				sha: `sha-${index}`,
				type: "blob",
			}));
			tree.push(
				{ path: "content/deleted.md", sha: "deleted", type: "blob" },
				{ path: "content/image.png", sha: "media", type: "blob" },
				{ path: "content/folder", sha: "folder", type: "tree" },
				{ path: "quartz.config.yaml", sha: "config", type: "blob" },
			);
			const { engine, plugin } = createSummaryContext(files, tree);
			vi.mocked(plugin.dataStore.loadStatusMetadata).mockImplementation(
				async (requests) =>
					new Map(
						[...requests].reverse().map(({ path }) => {
							const index = files.findIndex(
								(file) => file.path === path,
							);
							return [
								path,
								{
									localHash:
										index % 3 === 0
											? `sha-${index}`
											: index % 3 === 1
												? "outdated"
												: null,
									mediaLinks: [],
									dynamicSources: [],
								},
							];
						}),
					),
			);

			try {
				engine.start();
				await vi.runAllTimersAsync();
				expect(plugin.dataStore.loadLocalHash).not.toHaveBeenCalled();
				expect(
					plugin.dataStore.loadStatusMetadata,
				).toHaveBeenCalledExactlyOnceWith(
					files.slice(0, 12).map((file) => ({
						path: file.path,
						mtime: file.stat.mtime,
					})),
				);
				expect(
					plugin.statusCache.setSummary,
				).toHaveBeenCalledExactlyOnceWith({
					unpublished: 1,
					changed: 8,
					published: 4,
					deleted: 1,
					media: 1,
					timestamp: expect.any(Number),
				});
			} finally {
				engine.stop();
				Platform.isMobileApp = wasMobile;
			}
		},
	);
});
