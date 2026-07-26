import { debounce, type App, type EventRef, TFile } from "obsidian";
import type QuartzSyncer from "src/main";

export class BackgroundEngine {
	private running = false;
	private queue: Set<string> = new Set();
	private processing = false;
	private abortController: AbortController | null = null;
	private eventRefs: EventRef[] = [];

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private statusBar?: HTMLElement,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;

		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => {
				this.registerVaultListeners();
			}, 10000);
		});
	}

	stop(): void {
		this.running = false;
		this.abortController?.abort();
		this.queue.clear();
		this.updateStatusBar();
		this.cleanupListeners();
	}

	private registerVaultListeners(): void {
		if (!this.running) return;

		const debouncedProcess = debounce(
			(path: string) => this.enqueue(path),
			2000,
			true,
		);

		this.eventRefs.push(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					debouncedProcess(file.path);
				}
			}),
		);
		this.eventRefs.push(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					debouncedProcess(file.path);
				}
			}),
		);
		this.eventRefs.push(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.queue.delete(file.path);
				}
			}),
		);
		this.eventRefs.push(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.path.endsWith(".md")) {
					this.queue.delete(oldPath);
					debouncedProcess(file.path);
				}
			}),
		);
	}

	private cleanupListeners(): void {
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
	}

	private enqueue(path: string): void {
		this.queue.add(path);
		this.updateStatusBar();
		void this.processQueue();
	}

	private async processQueue(): Promise<void> {
		if (this.processing || this.queue.size === 0) return;
		this.processing = true;
		this.abortController = new AbortController();
		this.updateStatusBar();

		const publisher = this.plugin.getPublisher();
		if (!publisher) {
			this.processing = false;
			this.abortController = null;
			this.updateStatusBar();
			return;
		}

		try {
			while (this.queue.size > 0 && this.running) {
				const path = this.queue.values().next().value;
				if (!path) break;
				this.queue.delete(path);
				// Cache invalidation for next publish status refresh.
				await this.plugin.dataStore.dropFile(path);
				this.updateStatusBar();
			}
		} finally {
			this.processing = false;
			this.abortController = null;
			this.updateStatusBar();
		}
	}

	get pendingCount(): number {
		return this.queue.size;
	}

	get isRunning(): boolean {
		return this.running;
	}

	private updateStatusBar(): void {
		if (!this.statusBar) return;
		this.statusBar.setText(`Quartz Syncer: ${this.queue.size} pending`);
	}
}
