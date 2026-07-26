import { Modal, Platform } from "obsidian";
import type { App } from "obsidian";
import { diffLines } from "diff";
import { ScrollSync } from "src/views/DiffView/ScrollSync";

type DiffModalProps = {
	localContent: string;
	remoteContent: string;
	filePath: string;
};

type DiffViewMode = "split" | "unified";

type DiffRow = {
	leftNumber: number | null;
	rightNumber: number | null;
	leftText: string;
	rightText: string;
	leftClass?: string;
	rightClass?: string;
};

type UnifiedRow = {
	lineNumber: number | null;
	text: string;
	className?: string;
	prefix: string;
};

export class DiffModal extends Modal {
	private mode: DiffViewMode;
	private scrollSync: ScrollSync | null = null;

	constructor(
		app: App,
		private props: DiffModalProps,
	) {
		super(app);
		this.mode = Platform.isDesktopApp ? "split" : "unified";
	}

	onOpen(): void {
		this.modalEl.addClass("qs-diff-view");
		this.render();

		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});
	}

	onClose(): void {
		this.scrollSync?.destroy();
		this.scrollSync = null;
		this.contentEl.empty();
	}

	private render(): void {
		this.scrollSync?.destroy();
		this.scrollSync = null;
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: "diff-header" });
		header.createSpan({ text: this.props.filePath });

		const controls = header.createDiv({ cls: "diff-controls" });
		const splitButton = controls.createEl("button", {
			text: "Split",
			cls: this.mode === "split" ? "is-active" : "",
		});
		splitButton.addEventListener("click", () => {
			this.mode = "split";
			this.render();
		});

		const unifiedButton = controls.createEl("button", {
			text: "Unified",
			cls: this.mode === "unified" ? "is-active" : "",
		});
		unifiedButton.addEventListener("click", () => {
			this.mode = "unified";
			this.render();
		});

		if (this.mode === "split") {
			this.renderSplitView();
			return;
		}

		this.renderUnifiedView();
	}

	private renderSplitView(): void {
		const container = this.contentEl.createDiv({
			cls: "diff-split-container",
		});
		const leftPane = container.createDiv({
			cls: "diff-pane diff-pane-left",
		});
		const rightPane = container.createDiv({
			cls: "diff-pane diff-pane-right",
		});

		const rows = this.buildSplitRows();
		for (const row of rows) {
			this.renderSplitRow(
				leftPane,
				row.leftNumber,
				row.leftText,
				row.leftClass,
			);
			this.renderSplitRow(
				rightPane,
				row.rightNumber,
				row.rightText,
				row.rightClass,
			);
		}

		this.scrollSync = new ScrollSync(leftPane, rightPane);
	}

	private renderUnifiedView(): void {
		const container = this.contentEl.createDiv({ cls: "diff-unified" });
		const rows = this.buildUnifiedRows();

		for (const row of rows) {
			const line = container.createDiv({
				cls: `diff-line ${row.className ?? ""}`.trim(),
			});
			const numberEl = line.createSpan({ cls: "diff-line-number" });
			numberEl.setText(row.lineNumber ? String(row.lineNumber) : "");
			line.createSpan({
				cls: "diff-line-prefix",
				text: row.prefix,
			});
			line.createSpan({ cls: "diff-line-text", text: row.text });
		}
	}

	private renderSplitRow(
		pane: HTMLElement,
		lineNumber: number | null,
		text: string,
		className?: string,
	): void {
		const line = pane.createDiv({
			cls: `diff-line ${className ?? ""}`.trim(),
		});
		const numberEl = line.createSpan({ cls: "diff-line-number" });
		numberEl.setText(lineNumber ? String(lineNumber) : "");
		line.createSpan({ cls: "diff-line-text", text });
	}

	private buildSplitRows(): DiffRow[] {
		const rows: DiffRow[] = [];
		const changes = diffLines(
			this.props.remoteContent,
			this.props.localContent,
		);
		let leftNumber = 1;
		let rightNumber = 1;

		for (const change of changes) {
			const lines = splitLines(change.value);
			for (const line of lines) {
				if (change.added) {
					rows.push({
						leftNumber: null,
						rightNumber,
						leftText: "",
						rightText: line,
						rightClass: "diff-added",
					});
					rightNumber += 1;
					continue;
				}

				if (change.removed) {
					rows.push({
						leftNumber,
						rightNumber: null,
						leftText: line,
						rightText: "",
						leftClass: "diff-removed",
					});
					leftNumber += 1;
					continue;
				}

				rows.push({
					leftNumber,
					rightNumber,
					leftText: line,
					rightText: line,
				});
				leftNumber += 1;
				rightNumber += 1;
			}
		}

		return rows;
	}

	private buildUnifiedRows(): UnifiedRow[] {
		const rows: UnifiedRow[] = [];
		const changes = diffLines(
			this.props.remoteContent,
			this.props.localContent,
		);
		let lineNumber = 1;

		for (const change of changes) {
			const lines = splitLines(change.value);
			for (const line of lines) {
				if (change.added) {
					rows.push({
						lineNumber,
						text: line,
						className: "diff-added",
						prefix: "+",
					});
					lineNumber += 1;
					continue;
				}

				if (change.removed) {
					rows.push({
						lineNumber,
						text: line,
						className: "diff-removed",
						prefix: "-",
					});
					lineNumber += 1;
					continue;
				}

				rows.push({
					lineNumber,
					text: line,
					prefix: " ",
				});
				lineNumber += 1;
			}
		}

		return rows;
	}
}

function splitLines(value: string): string[] {
	const lines = value.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}
