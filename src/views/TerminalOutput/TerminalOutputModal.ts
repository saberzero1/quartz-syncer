import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type { IOperabilityEventSink } from "src/operability/types";

export type TerminalOutputExecutor = (options: {
	onStdout: (line: string) => void;
	onStderr: (line: string) => void;
	signal: AbortSignal;
}) => Promise<void>;

export class TerminalOutputModal extends Modal {
	private title: string;
	private executor: TerminalOutputExecutor;
	private outputEl: HTMLPreElement | null = null;
	private abortController: AbortController | null = null;
	private isRunning = false;

	constructor(
		app: App,
		title: string,
		executor: TerminalOutputExecutor,
		private eventSink?: IOperabilityEventSink,
	) {
		super(app);
		this.title = title;
		this.executor = executor;
	}

	onOpen(): void {
		this.eventSink?.emit("ui.modal.opened", { name: "terminal-output" });
		this.modalEl.addClass("qs-terminal-output");
		this.titleEl.setText(this.title);
		this.render();
		void this.runExecutor();
	}

	onClose(): void {
		this.eventSink?.emit("ui.modal.closed", { name: "terminal-output" });
		this.abort();
		this.contentEl.empty();
		this.outputEl = null;
	}

	private render(): void {
		this.contentEl.empty();

		this.outputEl = this.contentEl.createEl("pre");

		const actions = this.contentEl.createDiv({
			cls: "qs-terminal-output-actions",
		});

		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.abort());

		const copyButton = actions.createEl("button", { text: "Copy" });
		copyButton.addEventListener("click", () => {
			void this.copyOutput();
		});

		const closeButton = actions.createEl("button", { text: "Close" });
		closeButton.addEventListener("click", () => this.close());
	}

	private appendLine(line: string, isError = false): void {
		if (!this.outputEl) return;
		const span = this.outputEl.createSpan({
			cls: isError ? "qs-terminal-stderr" : undefined,
		});
		span.textContent = `${line}\n`;
		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}

	private async runExecutor(): Promise<void> {
		this.abortController = new AbortController();
		this.isRunning = true;

		try {
			await this.executor({
				onStdout: (line) => this.appendLine(line),
				onStderr: (line) => this.appendLine(line, true),
				signal: this.abortController.signal,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.appendLine(message, true);
			new Notice(`Command failed: ${message}`);
		} finally {
			this.isRunning = false;
		}
	}

	private abort(): void {
		if (!this.abortController || this.abortController.signal.aborted)
			return;
		this.abortController.abort();
		if (this.isRunning) {
			this.appendLine("Process aborted.", true);
		}
	}

	private async copyOutput(): Promise<void> {
		if (!this.outputEl) return;
		try {
			await navigator.clipboard.writeText(
				this.outputEl.textContent ?? "",
			);
			new Notice("Output copied to clipboard.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to copy output: ${message}`);
		}
	}
}
