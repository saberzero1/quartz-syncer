import { Modal, Notice, Platform } from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import { renderOverviewTab } from "src/views/QuartzHub/OverviewTab";
import { renderSetupTab } from "src/views/QuartzHub/SetupTab";

type HubTab = "overview" | "setup";

export class QuartzHub extends Modal {
	private activeTab: HubTab = "overview";
	private overviewEl: HTMLDivElement | null = null;
	private setupEl: HTMLDivElement | null = null;
	private overviewTabButton: HTMLElement | null = null;
	private setupTabButton: HTMLElement | null = null;
	private eventSink: IOperabilityEventSink | undefined;

	constructor(
		app: App,
		private plugin: QuartzSyncer,
	) {
		super(app);
		this.eventSink = plugin.getEventSink() ?? undefined;
	}

	onOpen(): void {
		if (!Platform.isDesktopApp) {
			new Notice("Quartz Hub is only available on desktop.");
			this.close();
			return;
		}
		this.modalEl.addClass("qs-hub");
		this.modalEl.setAttrs(qsDom("hub"));
		this.titleEl.setText("Quartz Hub");
		this.eventSink?.emit("ui.modal.opened", { name: "quartz-hub" });
		this.renderShell();

		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});
	}

	onClose(): void {
		this.eventSink?.emit("ui.modal.closed", { name: "quartz-hub" });
		this.overviewEl = null;
		this.setupEl = null;
		this.overviewTabButton = null;
		this.setupTabButton = null;
		this.contentEl.empty();
	}

	private renderShell(): void {
		this.contentEl.empty();

		const tabs = this.contentEl.createDiv({ cls: "qs-hub-tabs" });
		this.overviewTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Overview",
		});
		this.overviewTabButton.setAttrs(
			qsDom("hub-tab", { value: "overview" }),
		);
		this.setupTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Setup",
		});
		this.setupTabButton.setAttrs(qsDom("hub-tab", { value: "setup" }));

		this.overviewTabButton.addEventListener("click", () =>
			this.switchTab("overview"),
		);
		this.setupTabButton.addEventListener("click", () =>
			this.switchTab("setup"),
		);

		this.overviewEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.setupEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});

		this.renderOverview();
		renderSetupTab(this.setupEl, this.plugin, this.eventSink, {
			onNavigateToOverview: () => this.switchTab("overview"),
		});

		this.updateActiveTab();
	}

	private switchTab(tab: HubTab): void {
		if (this.activeTab === tab) return;
		this.activeTab = tab;

		if (tab === "overview") {
			this.renderOverview();
		}

		this.updateActiveTab();
	}

	private updateActiveTab(): void {
		this.overviewTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "overview",
		);
		this.setupTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "setup",
		);

		if (this.overviewEl) {
			this.overviewEl.style.display =
				this.activeTab === "overview" ? "" : "none";
		}
		if (this.setupEl) {
			this.setupEl.style.display =
				this.activeTab === "setup" ? "" : "none";
		}
	}

	private renderOverview(): void {
		if (!this.overviewEl) return;
		this.overviewEl.empty();
		renderOverviewTab(this.overviewEl, this.plugin, this.eventSink, {
			onNavigateToSetup: () => this.switchTab("setup"),
		});
	}

	getController(): QuartzHubController {
		return { close: () => this.close() };
	}
}

export interface QuartzHubController {
	close(): void;
}
