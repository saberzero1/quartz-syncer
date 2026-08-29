import { Modal, Notice, Platform } from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import { renderConfigTab } from "src/views/QuartzHub/ConfigTab";
import { renderLayoutTab } from "src/views/QuartzHub/LayoutTab";
import { renderOverviewTab } from "src/views/QuartzHub/OverviewTab";
import { renderPluginsTab } from "src/views/QuartzHub/PluginsTab";
import { renderSetupTab } from "src/views/QuartzHub/SetupTab";
import { renderTemplatesTab } from "src/views/QuartzHub/TemplatesTab";

type HubTab =
	| "overview"
	| "plugins"
	| "config"
	| "layout"
	| "templates"
	| "setup";

export class QuartzHub extends Modal {
	private activeTab: HubTab = "overview";
	private overviewEl: HTMLDivElement | null = null;
	private pluginsEl: HTMLDivElement | null = null;
	private configEl: HTMLDivElement | null = null;
	private layoutEl: HTMLDivElement | null = null;
	private templatesEl: HTMLDivElement | null = null;
	private setupEl: HTMLDivElement | null = null;
	private overviewTabButton: HTMLElement | null = null;
	private pluginsTabButton: HTMLElement | null = null;
	private configTabButton: HTMLElement | null = null;
	private layoutTabButton: HTMLElement | null = null;
	private templatesTabButton: HTMLElement | null = null;
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
		this.pluginsEl = null;
		this.configEl = null;
		this.layoutEl = null;
		this.templatesEl = null;
		this.setupEl = null;
		this.overviewTabButton = null;
		this.pluginsTabButton = null;
		this.configTabButton = null;
		this.layoutTabButton = null;
		this.templatesTabButton = null;
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
		this.pluginsTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Plugins",
		});
		this.pluginsTabButton.setAttrs(qsDom("hub-tab", { value: "plugins" }));
		this.configTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Config",
		});
		this.configTabButton.setAttrs(qsDom("hub-tab", { value: "config" }));
		this.layoutTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Layout",
		});
		this.layoutTabButton.setAttrs(qsDom("hub-tab", { value: "layout" }));
		this.templatesTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Templates",
		});
		this.templatesTabButton.setAttrs(
			qsDom("hub-tab", { value: "templates" }),
		);
		this.setupTabButton = tabs.createEl("button", {
			cls: "qs-hub-tab",
			text: "Setup",
		});
		this.setupTabButton.setAttrs(qsDom("hub-tab", { value: "setup" }));

		this.overviewTabButton.addEventListener("click", () =>
			this.switchTab("overview"),
		);
		this.pluginsTabButton.addEventListener("click", () =>
			this.switchTab("plugins"),
		);
		this.configTabButton.addEventListener("click", () =>
			this.switchTab("config"),
		);
		this.layoutTabButton.addEventListener("click", () =>
			this.switchTab("layout"),
		);
		this.templatesTabButton.addEventListener("click", () =>
			this.switchTab("templates"),
		);
		this.setupTabButton.addEventListener("click", () =>
			this.switchTab("setup"),
		);

		this.overviewEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.pluginsEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.configEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.layoutEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.templatesEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});
		this.setupEl = this.contentEl.createDiv({
			cls: "qs-hub-content",
		});

		this.renderOverview();
		renderPluginsTab(this.pluginsEl, this.plugin, this.eventSink);
		renderConfigTab(this.configEl, this.plugin, this.eventSink);
		renderLayoutTab(this.layoutEl, this.plugin, this.eventSink);
		renderTemplatesTab(this.templatesEl, this.plugin, this.eventSink);
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
		this.pluginsTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "plugins",
		);
		this.configTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "config",
		);
		this.layoutTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "layout",
		);
		this.templatesTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "templates",
		);
		this.setupTabButton?.classList.toggle(
			"is-active",
			this.activeTab === "setup",
		);

		if (this.overviewEl) {
			this.overviewEl.style.display =
				this.activeTab === "overview" ? "" : "none";
		}
		if (this.pluginsEl) {
			this.pluginsEl.style.display =
				this.activeTab === "plugins" ? "" : "none";
		}
		if (this.configEl) {
			this.configEl.style.display =
				this.activeTab === "config" ? "" : "none";
		}
		if (this.layoutEl) {
			this.layoutEl.style.display =
				this.activeTab === "layout" ? "" : "none";
		}
		if (this.templatesEl) {
			this.templatesEl.style.display =
				this.activeTab === "templates" ? "" : "none";
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
			onNavigateToPlugins: () => this.switchTab("plugins"),
		});
	}

	getController(): QuartzHubController {
		return { close: () => this.close() };
	}
}

export interface QuartzHubController {
	close(): void;
}
