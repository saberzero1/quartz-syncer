import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";

export class QuartzPreviewModal extends Modal {
	private quartzRunner: QuartzRunner;
	private repoPath: string;
	private port: number;
	private abortController: AbortController | null = null;
	private iframeEl: HTMLIFrameElement | null = null;
	private statusEl: HTMLElement | null = null;
	private isReady = false;

	constructor(
		app: App,
		quartzRunner: QuartzRunner,
		repoPath: string,
		port = 8080,
	) {
		super(app);
		this.quartzRunner = quartzRunner;
		this.repoPath = repoPath;
		this.port = port;
	}

	onOpen(): void {
		this.titleEl.setText("Quartz preview");
		this.render();
		void this.startServer();
	}

	onClose(): void {
		this.abort();
		this.contentEl.empty();
		this.iframeEl = null;
		this.statusEl = null;
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.setAttr(
			"style",
			"display: flex; flex-direction: column; height: 100%;",
		);

		this.statusEl = this.contentEl.createEl("p", {
			text: "Building Quartz site...",
		});

		this.iframeEl = this.contentEl.createEl("iframe", {
			cls: "qs-quartz-preview-frame",
		});
		this.iframeEl.setAttr(
			"style",
			"width: 100%; height: 100%; border: 0; display: none;",
		);
	}

	private async startServer(): Promise<void> {
		this.abortController = new AbortController();
		const result = this.quartzRunner.serve({
			cwd: this.repoPath,
			port: this.port,
			signal: this.abortController.signal,
			onStdout: (line) => this.handleOutput(line),
			onStderr: (line) => this.handleOutput(line, true),
		});

		if (!result.ok) {
			new Notice(result.error);
			return;
		}

		try {
			await result.result;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Quartz preview stopped: ${message}`);
		}
	}

	private handleOutput(line: string, isError = false): void {
		if (!this.statusEl) return;
		if (!this.isReady && /server running/i.test(line)) {
			this.isReady = true;
			this.statusEl.setText("Quartz preview ready.");
			if (this.iframeEl) {
				this.iframeEl.src = `http://localhost:${this.port}`;
				this.iframeEl.setAttr(
					"style",
					"width: 100%; height: 100%; border: 0;",
				);
			}
			return;
		}

		if (isError && !this.isReady) {
			this.statusEl.setText(line);
		}
	}

	private abort(): void {
		if (!this.abortController || this.abortController.signal.aborted)
			return;
		this.abortController.abort();
	}
}
