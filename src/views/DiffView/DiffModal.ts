import { Modal, Platform } from "obsidian";
import type { App } from "obsidian";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import type { ScrollSync } from "src/views/DiffView/ScrollSync";
import {
	computeDiffStats,
	expandAllCollapsed,
	getCollapseState,
	collapseAll,
	renderDiffView,
	type DiffViewMode,
} from "src/views/DiffView/DiffRenderer";

type DiffModalProps = {
	localContent: string;
	remoteContent: string;
	filePath: string;
	category?: string;
	diffViewStyle?: "split" | "unified" | "auto";
	contextLines?: number;
};

export class DiffModal extends Modal {
	private mode: DiffViewMode;
	private scrollSync: ScrollSync | null = null;
	private splitButtonEl: HTMLButtonElement | null = null;
	private unifiedButtonEl: HTMLButtonElement | null = null;
	private collapseToggleEl: HTMLButtonElement | null = null;
	private contentRegionEl: HTMLDivElement | null = null;

	constructor(
		app: App,
		private props: DiffModalProps,
		private eventSink?: IOperabilityEventSink,
	) {
		super(app);
		const style = this.props.diffViewStyle ?? "auto";
		this.mode =
			style === "auto"
				? Platform.isDesktopApp
					? "split"
					: "unified"
				: style;
		if (
			this.props.category === "unpublished" ||
			this.props.category === "deleted"
		) {
			this.mode = "unified";
		}
	}

	onOpen(): void {
		this.eventSink?.emit("ui.modal.opened", { name: "diff-viewer" });
		this.modalEl.addClass("qs-diff-view");
		this.modalEl.setAttrs(qsDom("diff-view"));
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: "diff-header" });
		header.createSpan({ text: this.props.filePath });

		const stats = computeDiffStats(
			this.props.localContent,
			this.props.remoteContent,
		);
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

		if (
			this.props.category === "unpublished" ||
			this.props.category === "deleted"
		) {
			this.splitButtonEl.hide();
			this.unifiedButtonEl.hide();
		}

		this.collapseToggleEl = controls.createEl("button", {
			text: "Expand all",
		});
		this.collapseToggleEl.addEventListener("click", () => {
			if (!this.contentRegionEl) return;
			const state = getCollapseState(this.contentRegionEl);
			if (!state.hasRegions) return;
			if (state.hasCollapsed) {
				expandAllCollapsed(this.contentRegionEl);
			} else {
				collapseAll(this.contentRegionEl);
			}
			this.updateCollapseToggle();
		});

		this.updateModeButtons();
		this.renderContent();

		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});
	}

	onClose(): void {
		this.eventSink?.emit("ui.modal.closed", { name: "diff-viewer" });
		this.scrollSync?.destroy();
		this.scrollSync = null;
		this.contentEl.empty();
		this.splitButtonEl = null;
		this.unifiedButtonEl = null;
		this.collapseToggleEl = null;
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
		this.contentRegionEl.addEventListener("qs-diff-collapse-change", () => {
			this.updateCollapseToggle();
		});

		this.scrollSync = renderDiffView(
			this.contentRegionEl,
			this.props.localContent,
			this.props.remoteContent,
			this.mode,
			this.props.contextLines ?? 3,
		);
		this.updateCollapseToggle();
	}

	private updateCollapseToggle(): void {
		if (!this.collapseToggleEl || !this.contentRegionEl) return;
		const state = getCollapseState(this.contentRegionEl);
		this.collapseToggleEl.disabled = !state.hasRegions;
		this.collapseToggleEl.textContent = state.hasRegions
			? state.hasCollapsed
				? "Expand all"
				: "Collapse all"
			: "Expand all";
	}
}
