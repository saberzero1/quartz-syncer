import { Modal, Platform } from "obsidian";
import type { App } from "obsidian";
import { diffLines } from "diff";
import { ScrollSync } from "src/views/DiffView/ScrollSync";

type DiffModalProps = {
	localContent: string;
	remoteContent: string;
	filePath: string;
	diffViewStyle?: "split" | "unified" | "auto";
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
	private splitButtonEl: HTMLButtonElement | null = null;
	private unifiedButtonEl: HTMLButtonElement | null = null;
	private contentRegionEl: HTMLDivElement | null = null;

	constructor(
		app: App,
		private props: DiffModalProps,
	) {
		super(app);
		const style = this.props.diffViewStyle ?? "auto";
		this.mode =
			style === "auto"
				? Platform.isDesktopApp
					? "split"
					: "unified"
				: style;
	}

	onOpen(): void {
		this.modalEl.addClass("qs-diff-view");
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: "diff-header" });
		header.createSpan({ text: this.props.filePath });

		const stats = this.computeDiffStats();
		if (stats.added > 0 || stats.removed > 0) {
			const statsEl = header.createSpan({ cls: "diff-stats" });
			statsEl.createSpan({
				cls: "diff-stat-added",
				text: `+${stats.added}`,
			});
			statsEl.createSpan({ text: " / " });
			statsEl.createSpan({
				cls: "diff-stat-removed",
				text: `-${stats.removed}`,
			});
		}

		const controls = header.createDiv({ cls: "diff-controls" });
		this.splitButtonEl = controls.createEl("button", {
			text: "Split",
		});
		this.splitButtonEl.addEventListener("click", () => {
			this.mode = "split";
			this.updateModeButtons();
			this.renderContent();
		});

		this.unifiedButtonEl = controls.createEl("button", {
			text: "Unified",
		});
		this.unifiedButtonEl.addEventListener("click", () => {
			this.mode = "unified";
			this.updateModeButtons();
			this.renderContent();
		});

		this.updateModeButtons();
		this.renderContent();

		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});
	}

	onClose(): void {
		this.scrollSync?.destroy();
		this.scrollSync = null;
		this.contentEl.empty();
		this.splitButtonEl = null;
		this.unifiedButtonEl = null;
		this.contentRegionEl = null;
	}

	private updateModeButtons(): void {
		this.splitButtonEl?.classList.toggle(
			"is-active",
			this.mode === "split",
		);
		this.unifiedButtonEl?.classList.toggle(
			"is-active",
			this.mode === "unified",
		);
	}

	private renderContent(): void {
		this.scrollSync?.destroy();
		this.scrollSync = null;
		this.contentRegionEl?.remove();
		this.contentRegionEl = this.contentEl.createDiv({
			cls: "diff-content",
		});

		if (this.mode === "split") {
			this.renderSplitView(this.contentRegionEl);
			return;
		}

		this.renderUnifiedView(this.contentRegionEl);
	}

	private renderSplitView(targetEl: HTMLElement): void {
		const container = targetEl.createDiv({
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

	private renderUnifiedView(targetEl: HTMLElement): void {
		const container = targetEl.createDiv({ cls: "diff-unified" });
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

	private computeDiffStats(): { added: number; removed: number } {
		const changes = diffLines(
			this.props.remoteContent,
			this.props.localContent,
		);
		let added = 0;
		let removed = 0;

		for (const change of changes) {
			const lineCount = splitLines(change.value).length;

			if (change.added) {
				added += lineCount;
			} else if (change.removed) {
				removed += lineCount;
			}
		}

		return { added, removed };
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
						leftClass: "diff-filler",
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
						rightClass: "diff-filler",
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
