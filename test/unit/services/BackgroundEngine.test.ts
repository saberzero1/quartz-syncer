import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import * as dataview from "src/compiler/integrations/apis/dataview";
import type { DatacoreApi } from "src/compiler/integrations/apis/datacore";
import type { Publisher } from "src/publisher/Publisher";
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
			getDynamicContentPaths: vi
				.fn()
				.mockResolvedValue(new Set<string>()),
			loadCompilationRevisions: vi.fn().mockResolvedValue({}),
			storeCompilationRevisions: vi.fn().mockResolvedValue(undefined),
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
			...publisherOverrides,
		}),
		settings: { useCache: true, autoCleanOrphanedMedia: false },
		dataStore: {
			dropFile: vi.fn().mockResolvedValue(undefined),
			isLocalFileOutdated: vi.fn().mockResolvedValue(true),
			hasDynamicContentFlag: vi.fn().mockResolvedValue(false),
			getDynamicContentPaths: vi
				.fn()
				.mockResolvedValue(new Set<string>()),
			loadCompilationRevisions: vi.fn().mockResolvedValue({}),
			storeCompilationRevisions: vi.fn().mockResolvedValue(undefined),
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
	return app;
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

	it("does not call hasDynamicContentFlag when useCache is false and a dataview-like event would fire", async () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		plugin.settings = { ...plugin.settings, useCache: false };

		const engine = new BackgroundEngine(app, plugin);
		engine.start();
		vi.advanceTimersByTime(40_001);

		await vi.runAllTimersAsync();

		expect(plugin.dataStore.hasDynamicContentFlag).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	describe("dynamic cache guards", () => {
		let app: App;
		let plugin: QuartzSyncer;
		let engine: BackgroundEngine;

		beforeEach(() => {
			vi.useFakeTimers();
			app = createApp();
			plugin = createPluginStub();
			engine = new BackgroundEngine(app, plugin);
			engine.compilationQueue.pause();
		});

		afterEach(() => {
			engine.stop();
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
			vi.useRealTimers();
		});

		const installDataview = (initialized = true) => {
			const api: dataview.DataviewApi = {
				settings: {},
				index: { initialized, revision: 2 },
				page: vi.fn(),
				tryEvaluate: vi.fn(),
				executeJs: vi.fn().mockResolvedValue(undefined),
				tryQueryMarkdown: vi.fn().mockResolvedValue(""),
			};
			vi.spyOn(dataview, "getDataviewApi").mockReturnValue(api);
			// MetadataCache lacks events in the shared mock; reuse its Workspace emitter.
			const on = vi.fn(app.workspace.on.bind(app.workspace));
			app.metadataCache.on = on;
			app.metadataCache.offref = app.workspace.offref.bind(app.workspace);
			return on;
		};

		const installDatacore = () => {
			const on = vi.fn(
				(
					event: "update" | "initialized",
					callback: (revision: number) => void,
				) =>
					app.workspace.on(event, (...args: unknown[]) => {
						if (typeof args[0] === "number") callback(args[0]);
					}),
			);
			const api: DatacoreApi = {
				core: {
					revision: 2,
					on,
					offref: app.workspace.offref.bind(app.workspace),
				},
				executeJs: vi.fn(),
				executeJsx: vi.fn(),
				executeTs: vi.fn(),
				executeTsx: vi.fn(),
			};
			vi.stubGlobal("datacore", api);
			return on;
		};

		it.each([true, false])(
			"does not register dataview listeners when useCache is false (initialized=%s)",
			(initialized) => {
				const on = installDataview(initialized);
				plugin.settings.useCache = false;

				engine.start();

				expect(on.mock.calls.map(([event]) => event)).toEqual([]);
			},
		);

		it.each([
			[true, "dataview:metadata-change"],
			[false, "dataview:index-ready"],
		] as const)(
			"registers dataview listeners when useCache is true (initialized=%s)",
			(initialized, event) => {
				const on = installDataview(initialized);

				engine.start();

				expect(on).toHaveBeenCalledTimes(1);
				expect(on).toHaveBeenCalledWith(event, expect.any(Function));
			},
		);

		it("does not register datacore listeners when useCache is false", () => {
			const on = installDatacore();
			plugin.settings.useCache = false;

			engine.start();

			expect(on.mock.calls.map(([event]) => event)).toEqual([]);
		});

		it("registers datacore listeners when useCache is true", () => {
			const on = installDatacore();

			engine.start();

			expect(on).toHaveBeenCalledTimes(1);
			expect(on).toHaveBeenCalledWith("update", expect.any(Function));
		});

		it.each([
			["dataview", false],
			["dataview", true],
			["datacore", false],
			["datacore", true],
		] as const)(
			"%s dynamic requeue honors useCache=%s after listener registration",
			async (source, useCache) => {
				if (source === "dataview") installDataview();
				else installDatacore();
				vi.mocked(
					plugin.dataStore.getDynamicContentPaths,
				).mockResolvedValue(new Set(["notes/dynamic.md"]));
				vi.mocked(
					plugin.dataStore.hasDynamicContentFlag,
				).mockResolvedValue(true);
				vi.mocked(
					plugin.dataStore.loadCompilationRevisions,
				).mockResolvedValue({
					dataviewRevision: 1,
					datacoreRevision: 1,
				});
				const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");
				engine.start();
				await vi.advanceTimersByTimeAsync(30_001);
				expect(enqueueSpy).toHaveBeenCalledTimes(0);

				// Keep the installed listener alive so the requeue guard is reachable.
				plugin.settings.useCache = useCache;
				if (source === "dataview") {
					app.workspace.trigger(
						"dataview:metadata-change",
						"update",
						createFile("notes/changed.md", Date.now()),
					);
				} else {
					app.workspace.trigger("update", 2);
				}
				await vi.advanceTimersByTimeAsync(1_001);

				expect(enqueueSpy.mock.calls).toEqual(
					useCache ? [["notes/dynamic.md", 5]] : [],
				);
				expect(
					plugin.dataStore.getDynamicContentPaths,
				).toHaveBeenCalledTimes(useCache ? 1 : 0);
			},
		);
	});

	it("does not call vault.getMarkdownFiles during the dynamic-requeue path when getDynamicContentPaths returns known paths", async () => {
		vi.useFakeTimers();
		const app = createApp();
		const plugin = createAutoPublishPluginStub();
		plugin.settings = { ...plugin.settings, useCache: true };

		const knownDynamicPaths = new Set(["notes/dynamic.md"]);
		plugin.dataStore.getDynamicContentPaths = vi
			.fn()
			.mockResolvedValue(knownDynamicPaths);

		const engine = new BackgroundEngine(app, plugin);

		const getMarkdownSpy = vi.spyOn(app.vault, "getMarkdownFiles");

		await vi.runAllTimersAsync();

		expect(getMarkdownSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it.each([false, true])(
		"prewarm with publishable metadata candidates honors useCache=%s across batches",
		async (useCache) => {
			vi.useFakeTimers();
			const files = Array.from({ length: 11 }, (_, index) =>
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
				publishFrontmatterKey: "publish",
			};
			const engine = new BackgroundEngine(app, plugin);
			const enqueueSpy = vi.spyOn(engine.compilationQueue, "enqueue");
			engine.compilationQueue.pause();

			try {
				engine.start();
				await vi.advanceTimersByTimeAsync(51);

				expect(enqueueSpy.mock.calls).toEqual(
					useCache ? files.map((file) => [file.path, 0]) : [],
				);
			} finally {
				engine.stop();
			}
		},
	);

	it("prewarm enqueues only publishable candidates when useCache is true", () => {
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

		const enqueued = enqueueSpy.mock.calls.map((c) => c[0]);
		expect(enqueued).not.toContain("notes/draft.md");
		vi.useRealTimers();
	});
});
