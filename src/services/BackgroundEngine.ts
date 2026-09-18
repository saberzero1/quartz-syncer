import { TFile, type App, type EventRef } from "obsidian";
import type QuartzSyncer from "src/main";
import { CompilationQueue } from "src/services/CompilationQueue";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { getSpecialFileType, PublishFile } from "src/publishFile/PublishFile";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import type { IOperabilityEventSink } from "src/operability/types";
import type { StatusSummary } from "src/services/StatusCacheService";
import { isMediaFile } from "src/utils/mediaTypes";
import { isPublishConfigured } from "src/publisher/PublishTargetResolver";
import { stripVaultPath } from "src/utils/utils";
import {
	getPerfMetrics,
	perfMetricsEnabled,
} from "src/operability/PerfMetrics";

const PRIORITY_VAULT_CHANGE = 5;
const PRIORITY_ACTIVE_FILE = 10;

const STARTUP_GUARD_MS = 30_000;
const VAULT_CHANGE_DEBOUNCE_MS = 2_000;

export class BackgroundEngine {
	private running = false;
	private vaultEventRefs: EventRef[] = [];
	private workspaceEventRefs: EventRef[] = [];
	private extCacheEventRef: EventRef | null = null;
	private compiler: SyncerPageCompiler | null = null;
	private lastActiveFilePath: string | null = null;
	private readonly startupTime = Date.now();

	private pendingVaultChanges = new Set<string>();
	private vaultChangeTimer: number | null = null;

	readonly compilationQueue: CompilationQueue;
	private initialFetchDone = false;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private onStatusChange?: (
			state: "ready" | "compiling" | "unconfigured",
			count: number,
			summary?: StatusSummary | null,
		) => void,
		private eventSink?: IOperabilityEventSink,
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
			void publisher
				.refreshTreeCache()
				.then(() => {
					void this.computeLightweightSummary();
				})
				.catch((error) => {
					console.debug("Initial tree cache fetch failed:", error);
					this.eventSink?.emit("tree.refresh.failed", {
						error:
							error instanceof Error
								? error.message
								: String(error),
					});
				});
		}
	}

	private async computeLightweightSummary(): Promise<void> {
		const publisher = this.plugin.getPublisher();
		if (!publisher) return;

		try {
			const settings = this.plugin.settings;

			const candidatePaths = collectCandidatePaths(
				this.app,
				this.plugin,
				settings,
			);

			const remoteTree = await publisher.getCachedTree();
			if (!remoteTree) return;

			const pathMapper = publisher.getPathMapper();
			const remoteMap = new Map<string, string>();

			for (const entry of remoteTree) {
				if (entry.type !== "blob") continue;
				if (!pathMapper.isInContentFolder(entry.path)) continue;
				remoteMap.set(entry.path, entry.sha);
			}

			let unpublished = 0;
			let changed = 0;
			let published = 0;
			const localRepoPaths = new Set<string>();
			const remoteBacked: { file: TFile; sha: string }[] = [];

			for (const filePath of candidatePaths) {
				const file = this.app.vault.getFileByPath(filePath);
				if (!file) continue;

				const vaultPath = stripVaultPath(file.path, settings.vaultPath);
				const repoPath = pathMapper.toRepoPath(vaultPath);
				localRepoPaths.add(repoPath);

				const remoteSha = remoteMap.get(repoPath);

				if (!remoteSha) {
					unpublished++;
					continue;
				}

				remoteBacked.push({ file, sha: remoteSha });
			}

			const metadata = await this.plugin.dataStore.loadStatusMetadata(
				remoteBacked.map(({ file }) => ({
					path: file.path,
					mtime: file.stat.mtime,
				})),
			);

			remoteBacked.forEach(({ file, sha }) => {
				const localHash = metadata.get(file.path)?.localHash;

				if (localHash && localHash === sha) {
					published++;
				} else {
					changed++;
				}
			});

			let deleted = 0;
			let media = 0;

			for (const repoPath of remoteMap.keys()) {
				if (localRepoPaths.has(repoPath)) continue;

				if (isMediaFile(repoPath)) {
					media++;
				} else {
					deleted++;
				}
			}

			this.plugin.statusCache.setSummary({
				unpublished,
				changed,
				published,
				deleted,
				media,
				timestamp: Date.now(),
			});

			this.updateStatusBar();
		} catch {
			// No-op
		}
	}

	start(): void {
		if (this.running) return;
		this.eventSink?.emit("engine.started", {});
		this.running = true;

		this.app.workspace.onLayoutReady(() => {
			this.registerVaultListeners();
			this.registerActiveLeafListener();
			this.registerExtCacheListener();
			this.fetchRemoteTreeOnFirstIdle();
		});
	}

	stop(): void {
		this.eventSink?.emit("engine.stopped", {});
		this.running = false;
		this.compilationQueue.cancel();
		this.pendingVaultChanges.clear();

		if (this.vaultChangeTimer !== null) {
			window.clearTimeout(this.vaultChangeTimer);
			this.vaultChangeTimer = null;
		}
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
		const cached = await this.plugin.dataStore.loadFile(path, mtime);

		if (cached?.localData) return;

		if (signal.aborted) return;

		try {
			const metrics = perfMetricsEnabled ? getPerfMetrics() : null;
			await publishFile.compile({
				cachedEntry: cached ?? null,
				onDynamicClassification: metrics
					? (hasDynamicContent) => {
							metrics.increment(
								hasDynamicContent
									? "dynamicCompileStarts"
									: "staticCompileStarts",
							);
						}
					: undefined,
				getMetadata: async () => {
					const mediaLinks = await publishFile.getBlobLinks();
					return { mediaLinks };
				},
			});
			if (metrics) {
				metrics.increment(
					publishFile.hasDynamicContent
						? "dynamicCompileCompletions"
						: "staticCompileCompletions",
				);
			}
			this.eventSink?.emit("compilation.completed", { path });
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return;
			}

			this.eventSink?.emit("compilation.failed", {
				path,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	// --- Vault listeners ---

	private registerVaultListeners(): void {
		if (!this.running) return;

		const debouncedEnqueue = (path: string) =>
			this.scheduleVaultChange(path);

		this.vaultEventRefs.push(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.isPublishableFile(file)) {
					if (this.isStartupNoise(file)) return;
					debouncedEnqueue(file.path);
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && this.isPublishableFile(file)) {
					if (this.isStartupNoise(file)) return;
					debouncedEnqueue(file.path);
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && this.isPublishableFile(file)) {
					this.plugin.dataStore.dropFile(file.path).catch((error) => {
						console.debug("Failed to drop cache entry:", error);
					});
					this.plugin.statusCache.markStaleFile(file.path);
				}
			}),
		);

		this.vaultEventRefs.push(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isPublishablePath(oldPath)) {
					this.plugin.dataStore.dropFile(oldPath).catch((error) => {
						console.debug("Failed to drop cache entry:", error);
					});
					this.plugin.statusCache.markStaleFile(oldPath);
				}
				if (file instanceof TFile && this.isPublishableFile(file)) {
					this.plugin.statusCache.markStaleFile(file.path);
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

	private registerExtCacheListener(): void {
		if (!this.running) return;

		const extCache = this.plugin.cacheHandle?.api;
		if (!extCache) return;

		const onFileUpdated = (path: string) => {
			const settings = this.plugin.settings;

			if (settings.allNotesPublishableByDefault) {
				this.plugin.statusCache.markStaleFile(path);
				return;
			}

			const publishable = extCache.getFilesWithFrontmatterValue(
				settings.publishFrontmatterKey,
				true,
			);

			if (publishable.has(path)) {
				this.plugin.statusCache.markStaleFile(path);
			}
		};

		if (extCache.isReady) {
			this.extCacheEventRef = extCache.on("file-updated", onFileUpdated);
		} else {
			const readyRef = extCache.on("ready", () => {
				extCache.offref(readyRef);
				if (!this.running) return;
				this.extCacheEventRef = extCache.on(
					"file-updated",
					onFileUpdated,
				);
			});
		}
	}

	private isPublishableFile(file: TFile): boolean {
		if (file.extension === "md") return true;
		const type = getSpecialFileType(file);
		return type === "base" || type === "canvas" || type === "excalidraw";
	}

	private isPublishablePath(path: string): boolean {
		if (path.endsWith(".md")) return true;
		if (path.endsWith(".canvas")) return true;
		if (path.endsWith(".base")) return true;
		return path.endsWith(".excalidraw") || path.endsWith(".excalidraw.md");
	}

	// --- Startup noise guard ---

	private isStartupNoise(file: TFile): boolean {
		if (Date.now() - this.startupTime > STARTUP_GUARD_MS) return false;

		return file.stat.mtime < this.startupTime;
	}

	// --- Vault change coalescing ---

	/**
	 * Collect changed paths and flush them once the vault goes quiet.
	 *
	 * A single shared debouncer cannot be used here: it fires with only the
	 * last arguments, so editing several notes inside one window would enqueue
	 * only the last of them and silently skip precompiling the rest.
	 */
	private scheduleVaultChange(path: string): void {
		this.pendingVaultChanges.add(path);

		if (this.vaultChangeTimer !== null) {
			window.clearTimeout(this.vaultChangeTimer);
		}

		this.vaultChangeTimer = window.setTimeout(() => {
			this.vaultChangeTimer = null;
			const paths = [...this.pendingVaultChanges];
			this.pendingVaultChanges.clear();

			if (!this.running) return;

			for (const pending of paths) {
				this.enqueue(pending, PRIORITY_VAULT_CHANGE);
			}
		}, VAULT_CHANGE_DEBOUNCE_MS);
	}

	// --- Enqueue ---

	private enqueue(path: string, priority: number): void {
		if (perfMetricsEnabled) {
			getPerfMetrics()?.increment("enqueueAttempts");
		}
		this.compilationQueue.enqueue(path, priority);
		this.eventSink?.emit("compilation.enqueued", { path });
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

		if (!this.plugin.getPublisher()) return;

		this.autoPublishing = true;
		try {
			const idleTimeout = Promise.race([
				this.compilationQueue.onIdle(),
				new Promise<void>((resolve) =>
					window.setTimeout(resolve, 30_000),
				),
			]);

			await idleTimeout;

			// Re-resolved after the wait: settings can change during it, which
			// would otherwise publish to the previously selected destination.
			const publisher = this.plugin.getPublisher();

			if (!publisher) return;

			const status = await publisher.getPublishStatus();
			const pending = [...status.unpublished, ...status.changed];
			const deleted = status.deleted;

			if (pending.length === 0 && deleted.length === 0) return;

			let published = 0;

			if (pending.length > 0) {
				const result = await publisher.publishBatch(
					pending,
					"Auto-published via Quartz Syncer",
				);
				published = result.filesPublished;

				for (const failure of result.failures ?? []) {
					console.error(
						`Quartz Syncer auto-publish: skipped "${failure.vaultPath}": ${failure.error}`,
					);
				}
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
				`Auto-publish: ${published} published, ${deleted.length} deleted`,
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

		if (this.extCacheEventRef) {
			this.plugin.cacheHandle?.api?.offref(this.extCacheEventRef);
			this.extCacheEventRef = null;
		}
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

	get isAutoPublishPaused(): boolean {
		return this.autoPublishPaused;
	}

	get queuedPaths(): string[] {
		return this.compilationQueue.queuedPaths;
	}

	private updateStatusBar(): void {
		if (!this.onStatusChange) return;
		const count = this.pendingCount;

		if (count === 0 && !isPublishConfigured(this.plugin.settings)) {
			this.onStatusChange(
				"unconfigured",
				0,
				this.plugin.statusCache.getSummary(),
			);

			return;
		}

		this.onStatusChange(
			count > 0 ? "compiling" : "ready",
			count,
			this.plugin.statusCache.getSummary(),
		);
	}
}
