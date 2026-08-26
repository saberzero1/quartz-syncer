import { setIcon } from "obsidian";
import { qsDom } from "src/operability/DomContract";

export type StatusBarState = "ready" | "compiling" | "error" | "unconfigured";

export class StatusBar {
	private iconEl: HTMLElement;
	private textEl: HTMLElement;
	private state: StatusBarState = "unconfigured";

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

		const tooltips: Record<StatusBarState, string> = {
			ready: "Quartz Syncer: ready",
			compiling: `Quartz Syncer: compiling ${count ?? 0} files`,
			error: "Quartz Syncer: error",
			unconfigured: "Quartz Syncer: not configured",
		};

		this.el.ariaLabel = tooltips[state];
	}
}
