import { debounce, Events, TFile, type App, type EventRef } from "obsidian";
import type QuartzSyncer from "src/main";
import { CompilationQueue } from "src/services/CompilationQueue";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { getDataviewApi } from "src/compiler/integrations/apis/dataview";

const PRIORITY_PREWARM = 0;
const PRIORITY_VAULT_CHANGE = 5;
const PRIORITY_ACTIVE_FILE = 10;

const STARTUP_GUARD_MS = 30_000;
const STARTUP_DELAY_MS = 10_000;

export class BackgroundEngine {
	private running = false;
	private vaultEventRefs: EventRef[] = [];
	private workspaceEventRefs: EventRef[] = [];
	private metadataCacheEventRefs: EventRef[] = [];
	private datacoreEventRefs: EventRef[] = [];
	private compiler: SyncerPageCompiler | null = null;
	private lastActiveFilePath: string | null = null;
	private readonly startupTime = Date.now();

	readonly compilationQueue: CompilationQueue;
	private initialFetchDone = false;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private onStatusChange?: (
			state: "ready" | "compiling",
			count: number,
		) => void,
	) {
		this.compilationQueue = new CompilationQueue({
			concurrency: 1,
			processor: (path, signal) => this.compileFile(path, signal),
			onStatusChange: () => {
				this.updateStatusBar();
				this.fetchRemoteTreeOnFirstIdle();
			},
		});
	}

	private fetchRemoteTreeOnFirstIdle(): void {
		if (this.initialFetchDone) return;
		if (this.compilationQueue.pendingCount > 0) return;
		if (this.compilationQueue.inFlightCount > 0) return;

		this.initialFetchDone = true;

		const publisher = this.plugin.getPublisher();

		if (publisher) {
			void publisher.refreshTreeCache();
		}
	}

	start(): void {
		if (this.running) return;
		this.running = true;

		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => {
				this.registerVaultListeners();
				this.registerActiveLeafListener();
				this.registerDataviewListeners();
				this.registerDatacoreListeners();
				this.prewarmCache();
			}, STARTUP_DELAY_MS);
		});
	}

	stop(): void {
		this.running = false;
		this.compilationQueue.cancel();
		this.updateStatusBar();
		this.cleanupListeners();
	}

	private getOrCreateCompiler(): SyncerPageCompiler {
		if (!this.compiler) {
			this.compiler = new SyncerPageCompiler(
				this.app,
				this.app.vault,
				this.plugin.settings,
				this.app.metadataCache,
				this.plugin.dataStore,
			);
		}

		return this.compiler;
	}

	private async compileFile(
		path: string,
		signal: AbortSignal,
	): Promise<void> {
		if (signal.aborted) return;

		if (!this.plugin.settings.useCache) {
			await this.plugin.dataStore.dropFile(path);
			return;
		}

		const file = this.app.vault.getFileByPath(path);

		if (!file) return;

		const activeFilePath = this.app.workspace.getActiveFile?.()?.path;

		if (activeFilePath === path) return;

		const compiler = this.getOrCreateCompiler();

		const publishFile = new PublishFile({
			file,
			compiler,
			metadataCache: this.app.metadataCache,
			vault: this.app.vault,
			settings: this.plugin.settings,
			datastore: this.plugin.dataStore,
		});

		if (!publishFile.shouldPublish()) return;

		const mtime = file.stat.mtime;
		const cached = await this.plugin.dataStore.loadFile(path);

		if (
			cached?.localData &&
			cached.version === this.plugin.dataStore.version
		) {
			const mtimeMatch = cached.sourceMtime === mtime;

			if (!cached.hasDynamicContent && mtimeMatch) return;

			if (cached.hasDynamicContent && mtimeMatch) {
				const dvApi = getDataviewApi();
				const dcApi = this.getDatacoreApi();
				const dvCurrent = dvApi?.index?.revision;
				const dcCurrent = dcApi?.core?.revision;

				const dvMatch =
					dvCurrent === undefined ||
					cached.dataviewRevision === dvCurrent;
				const dcMatch =
					dcCurrent === undefined ||
					cached.datacoreRevision === dcCurrent;

				if (dvMatch && dcMatch) return;
			}
		}

		if (signal.aborted) return;

		await publishFile.compile();

		const blobLinks = await publishFile.getBlobLinks();
		await this.plugin.dataStore.storeMediaLinks(path, blobLinks);

		const dvApi = getDataviewApi();
		const dcApi = this.getDatacoreApi();

		await this.plugin.dataStore.storeCompilationRevisions(
			path,
			dvApi?.index?.revision,
			dcApi?.core?.revision,
		);
	}

	// --- Vault listeners ---

	private registerVaultListeners(): void {
		if (!this.running) return;

		const debouncedEnqueue = debounce(
			(path: string) => this.enqueue(path, PRIORITY_VAULT_CHANGE),
			2000,
			true,
		);

		this.vaultEventRefs.push(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.isStartupNoise(file)) return;
					debouncedEnqueue(file.path);
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.isStartupNoise(file)) return;
					debouncedEnqueue(file.path);
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.plugin.dataStore.dropFile(file.path).catch((error) => {
						console.debug("Failed to drop cache entry:", error);
					});
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("rename", (file, oldPath) => {
				if (oldPath.endsWith(".md")) {
					this.plugin.dataStore.dropFile(oldPath).catch((error) => {
						console.debug("Failed to drop cache entry:", error);
					});
				}
				if (file instanceof TFile && file.path.endsWith(".md")) {
					if (!this.isStartupNoise(file)) {
						debouncedEnqueue(file.path);
					}
				}
			}),
		);
	}

	// --- Active leaf listener ---

	private registerActiveLeafListener(): void {
		if (!this.running) return;

		const getActiveFilePath = (): string | null => {
			try {
				return this.app.workspace.getActiveFile?.()?.path ?? null;
			} catch {
				return null;
			}
		};

		this.lastActiveFilePath = getActiveFilePath();

		this.workspaceEventRefs.push(
			this.app.workspace.on("active-leaf-change", () => {
				const previousPath = this.lastActiveFilePath;
				const currentPath = getActiveFilePath();

				this.lastActiveFilePath = currentPath;

				if (previousPath && previousPath !== currentPath) {
					this.enqueue(previousPath, PRIORITY_ACTIVE_FILE);
				}
			}),
		);
	}

	// --- Dataview listeners ---

	private registerDataviewListeners(): void {
		if (!this.running) return;

		const dvApi = getDataviewApi();

		if (!dvApi) return;

		const hasRevisionApi =
			dvApi.index !== undefined &&
			typeof dvApi.index.revision === "number";

		const onMetadataChange = (...args: unknown[]) => {
			const type = args[0];
			const file = args[1];

			if (type !== "update") return;
			if (!(file instanceof TFile)) return;
			if (this.isStartupNoise(file)) return;

			this.requeueDynamicFiles(
				hasRevisionApi ? dvApi.index?.revision : undefined,
				"dataview",
			);
		};

		const cacheEvents = this.app.metadataCache as Events;

		const initHandler = () => {
			this.metadataCacheEventRefs.push(
				cacheEvents.on("dataview:metadata-change", onMetadataChange),
			);
		};

		if (dvApi.index?.initialized) {
			initHandler();
		} else {
			this.metadataCacheEventRefs.push(
				cacheEvents.on("dataview:index-ready", initHandler),
			);
		}
	}

	// --- Datacore listeners ---

	private registerDatacoreListeners(): void {
		if (!this.running) return;

		const dcApi = this.getDatacoreApi();
		const core = dcApi?.core;

		if (!core?.on || !core.offref) return;

		const onUpdate = (revision: number) => {
			this.requeueDynamicFiles(revision, "datacore");
		};

		const ref = core.on("update", onUpdate);

		if (ref) {
			this.datacoreEventRefs.push(ref);
		}
	}

	private getDatacoreApi():
		| import("src/compiler/integrations/apis/datacore").DatacoreApi
		| undefined {
		const dc = (
			window as unknown as {
				datacore?: import("src/compiler/integrations/apis/datacore").DatacoreApi;
			}
		).datacore;

		return dc;
	}

	// --- Dynamic file re-enqueue ---

	private requeueDynamicFiles(
		currentRevision: number | undefined,
		source: "dataview" | "datacore",
	): void {
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			void this.checkAndRequeueDynamic(
				file.path,
				currentRevision,
				source,
			);
		}
	}

	private async checkAndRequeueDynamic(
		path: string,
		currentRevision: number | undefined,
		source: "dataview" | "datacore",
	): Promise<void> {
		const hasDynamic =
			await this.plugin.dataStore.hasDynamicContentFlag(path);

		if (!hasDynamic) return;

		if (currentRevision === undefined) {
			this.enqueue(path, PRIORITY_VAULT_CHANGE);
			return;
		}

		const stored =
			await this.plugin.dataStore.loadCompilationRevisions(path);

		const storedRevision =
			source === "dataview"
				? stored.dataviewRevision
				: stored.datacoreRevision;

		if (storedRevision === undefined || currentRevision > storedRevision) {
			this.enqueue(path, PRIORITY_VAULT_CHANGE);
		}
	}

	// --- Startup pre-warm ---

	private prewarmCache(): void {
		if (!this.running) return;

		const files = this.app.vault.getMarkdownFiles();
		let index = 0;

		const enqueueBatch = () => {
			if (!this.running) return;

			const batchEnd = Math.min(index + 10, files.length);

			while (index < batchEnd) {
				const file = files[index];

				if (file) {
					this.compilationQueue.enqueue(file.path, PRIORITY_PREWARM);
				}

				index++;
			}

			if (index < files.length) {
				window.setTimeout(enqueueBatch, 50);
			}
		};

		enqueueBatch();
	}

	// --- Startup noise guard ---

	private isStartupNoise(file: TFile): boolean {
		if (Date.now() - this.startupTime > STARTUP_GUARD_MS) return false;

		return file.stat.mtime < this.startupTime;
	}

	// --- Enqueue ---

	private enqueue(path: string, priority: number): void {
		this.compilationQueue.enqueue(path, priority);
		this.updateStatusBar();
	}

	// --- Auto-publish ---

	private autoPublishTimer: number | null = null;
	private autoPublishing = false;
	private autoPublishPaused = false;

	startAutoPublish(intervalMinutes: number): void {
		this.stopAutoPublish();
		if (intervalMinutes < 1) return;

		const intervalMs = intervalMinutes * 60 * 1000;
		this.autoPublishTimer = window.setInterval(() => {
			void this.runAutoPublish();
		}, intervalMs);
	}

	stopAutoPublish(): void {
		if (this.autoPublishTimer !== null) {
			window.clearInterval(this.autoPublishTimer);
			this.autoPublishTimer = null;
		}
	}

	pauseAutoPublish(): void {
		this.autoPublishPaused = true;
	}

	resumeAutoPublish(): void {
		this.autoPublishPaused = false;
	}

	private async runAutoPublish(): Promise<void> {
		if (this.autoPublishing) return;
		if (this.autoPublishPaused) return;
		if (this.compilationQueue.isProcessing) return;

		const publisher = this.plugin.getPublisher();
		if (!publisher) return;

		this.autoPublishing = true;
		try {
			const idleTimeout = Promise.race([
				this.compilationQueue.onIdle(),
				new Promise<void>((resolve) =>
					window.setTimeout(resolve, 30_000),
				),
			]);

			await idleTimeout;

			const status = await publisher.getPublishStatus();
			const pending = [...status.unpublished, ...status.changed];
			const deleted = status.deleted;

			if (pending.length === 0 && deleted.length === 0) return;

			if (pending.length > 0) {
				await publisher.publishBatch(
					pending,
					"Auto-published via Quartz Syncer",
				);
			}
			if (deleted.length > 0) {
				await publisher.deleteBatch(
					deleted,
					"Auto-deleted via Quartz Syncer",
				);
			}

			if (this.plugin.settings.autoCleanOrphanedMedia) {
				const cleanResult = await publisher.cleanOrphanedMedia();
				if (cleanResult && !cleanResult.success) {
					console.debug(
						"Auto-clean orphaned media failed:",
						cleanResult.error ?? "Unknown error",
					);
				}
			}

			console.debug(
				`Auto-publish: ${pending.length} published, ${deleted.length} deleted`,
			);
		} catch (e) {
			console.debug("Auto-publish failed:", e);
		} finally {
			this.autoPublishing = false;
		}
	}

	// --- Cleanup ---

	private cleanupListeners(): void {
		for (const ref of this.vaultEventRefs) {
			this.app.vault.offref(ref);
		}
		this.vaultEventRefs = [];

		for (const ref of this.workspaceEventRefs) {
			this.app.workspace.offref(ref);
		}
		this.workspaceEventRefs = [];

		for (const ref of this.metadataCacheEventRefs) {
			this.app.metadataCache.offref(ref);
		}
		this.metadataCacheEventRefs = [];

		const dcApi = this.getDatacoreApi();

		if (dcApi?.core?.offref) {
			for (const ref of this.datacoreEventRefs) {
				dcApi.core.offref(ref);
			}
		}
		this.datacoreEventRefs = [];
	}

	// --- Status ---

	get pendingCount(): number {
		return (
			this.compilationQueue.pendingCount +
			this.compilationQueue.inFlightCount
		);
	}

	get isRunning(): boolean {
		return this.running;
	}

	get isAutoPublishActive(): boolean {
		return this.autoPublishTimer !== null;
	}

	private updateStatusBar(): void {
		if (!this.onStatusChange) return;
		const count = this.pendingCount;
		this.onStatusChange(count > 0 ? "compiling" : "ready", count);
	}
}
