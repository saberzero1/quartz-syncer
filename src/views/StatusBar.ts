import { setIcon } from "obsidian";
import { qsDom } from "src/operability/DomContract";
import type { StatusSummary } from "src/services/StatusCacheService";

export type StatusBarState = "ready" | "compiling" | "error" | "unconfigured";

export class StatusBar {
	private iconEl: HTMLElement;
	private textEl: HTMLElement;
	private state: StatusBarState = "unconfigured";
	private summary: StatusSummary | null = null;

	constructor(
		private el: HTMLElement,
		private onClick: (state: StatusBarState) => void,
	) {
		this.el.addClass("mod-clickable");
		this.el.setAttribute("data-tooltip-position", "top");
		this.iconEl = this.el.createSpan({
			cls: "quartz-syncer-status-icon",
		});
		this.textEl = this.el.createSpan({
			cls: "quartz-syncer-status-text",
		});
		this.el.addEventListener("click", () => this.onClick(this.state));
		this.setState("unconfigured");
	}

	get currentState(): StatusBarState {
		return this.state;
	}

	setSummary(summary: StatusSummary | null): void {
		this.summary = summary;
		this.updateTooltip();
	}

	setState(state: StatusBarState, count?: number): void {
		this.state = state;
		this.el.setAttrs(qsDom("statusbar", { state }));
		this.el.removeClass(
			"is-ready",
			"is-compiling",
			"is-error",
			"is-unconfigured",
		);
		this.el.addClass(`is-${state}`);

		const icons: Record<StatusBarState, string> = {
			ready: "leaf",
			compiling: "refresh-cw",
			error: "leaf",
			unconfigured: "leaf",
		};

		setIcon(this.iconEl, icons[state]);

		const showCount = state === "compiling" && !!count && count > 0;
		this.textEl.setText(showCount ? String(count) : "");

		this.updateTooltip(count);
	}

	private updateTooltip(compilingCount?: number): void {
		if (this.state !== "ready" || !this.summary) {
			const tooltips: Record<StatusBarState, string> = {
				ready: "Quartz Syncer: ready",
				compiling: `Quartz Syncer: compiling ${compilingCount ?? 0} files`,
				error: "Quartz Syncer: error",
				unconfigured: "Quartz Syncer: not configured",
			};
			this.el.ariaLabel = tooltips[this.state];
			return;
		}

		const parts: string[] = ["Quartz Syncer"];

		if (this.summary.unpublished > 0) {
			parts.push(`${this.summary.unpublished} unpublished`);
		}

		if (this.summary.changed > 0) {
			parts.push(`${this.summary.changed} changed`);
		}

		if (this.summary.deleted > 0) {
			parts.push(`${this.summary.deleted} deleted`);
		}

		if (
			this.summary.unpublished === 0 &&
			this.summary.changed === 0 &&
			this.summary.deleted === 0
		) {
			parts.push("all published");
		}

		this.el.ariaLabel = parts.join(" · ");
	}
}
