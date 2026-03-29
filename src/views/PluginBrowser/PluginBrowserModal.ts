import { type App, Modal, Notice } from "obsidian";
import type {
	QuartzPluginRegistry,
	RegistryPluginEntry,
} from "src/quartz/QuartzPluginRegistry";
import type {
	QuartzPluginSource,
	QuartzV5Config,
} from "src/quartz/QuartzConfigTypes";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import { getPluginSourceKey } from "src/quartz/QuartzPluginUtils";
import Logger from "js-logger";

const logger = Logger.get("plugin-browser-modal");

type InstallPluginFn = (source: QuartzPluginSource) => Promise<void>;

export class PluginBrowserModal extends Modal {
	private registry: QuartzPluginRegistry;
	private config: QuartzV5Config;
	private onInstall: InstallPluginFn;
	private allPlugins: RegistryPluginEntry[] = [];
	private searchQuery = "";
	private selectedTag = "";
	private isLoading = false;
	private installingPlugins: Set<string> = new Set();
	private pluginManager = new QuartzPluginManager();

	constructor(
		app: App,
		registry: QuartzPluginRegistry,
		config: QuartzV5Config,
		onInstall: InstallPluginFn,
	) {
		super(app);
		this.registry = registry;
		this.config = config;
		this.onInstall = onInstall;
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("quartz-syncer-plugin-browser");
		this.titleEl.setText("Community Plugin Browser");
		this.loadAndRender();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadAndRender(): Promise<void> {
		this.isLoading = true;
		this.render();

		try {
			this.allPlugins = await this.registry.getPlugins();
		} catch (error) {
			logger.warn("Failed to load registry", error);
			this.allPlugins = [];
		}

		this.isLoading = false;
		this.render();
	}

	private render(): void {
		this.contentEl.empty();

		if (this.isLoading) {
			this.contentEl.createEl("p", {
				text: "Loading plugin registry...",
				cls: "quartz-syncer-plugin-browser-loading",
			});

			return;
		}

		if (this.allPlugins.length === 0) {
			this.contentEl.createEl("p", {
				text: "Could not load the plugin registry. Check your internet connection and try again.",
			});

			return;
		}

		this.renderControls();

		const filtered = this.getFilteredPlugins();

		const listEl = this.contentEl.createDiv(
			"quartz-syncer-plugin-browser-list",
		);

		if (filtered.length === 0) {
			listEl.createEl("p", {
				text: "No plugins match your search.",
				cls: "quartz-syncer-plugin-browser-empty",
			});

			return;
		}

		for (const entry of filtered) {
			this.renderPluginCard(listEl, entry);
		}
	}

	private renderControls(): void {
		const controlsEl = this.contentEl.createDiv(
			"quartz-syncer-plugin-browser-controls",
		);

		const searchInput = controlsEl.createEl("input", {
			type: "text",
			placeholder: "Search plugins...",
			cls: "quartz-syncer-plugin-browser-search",
		});

		searchInput.value = this.searchQuery;

		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		const allTags = this.getAllTags();

		if (allTags.length > 0) {
			const tagSelect = controlsEl.createEl("select", {
				cls: "quartz-syncer-plugin-browser-tag-filter",
			});

			tagSelect.createEl("option", { text: "All categories", value: "" });

			for (const tag of allTags) {
				tagSelect.createEl("option", { text: tag, value: tag });
			}

			tagSelect.value = this.selectedTag;

			tagSelect.addEventListener("change", () => {
				this.selectedTag = tagSelect.value;
				this.renderList();
			});
		}
	}

	private renderList(): void {
		const existing = this.contentEl.querySelector(
			".quartz-syncer-plugin-browser-list",
		);

		if (existing) existing.remove();

		const filtered = this.getFilteredPlugins();

		const listEl = this.contentEl.createDiv(
			"quartz-syncer-plugin-browser-list",
		);

		if (filtered.length === 0) {
			listEl.createEl("p", {
				text: "No plugins match your search.",
				cls: "quartz-syncer-plugin-browser-empty",
			});

			return;
		}

		for (const entry of filtered) {
			this.renderPluginCard(listEl, entry);
		}
	}

	private renderPluginCard(
		container: HTMLElement,
		entry: RegistryPluginEntry,
	): void {
		const isInstalled = this.isPluginInstalled(entry);
		const isInstalling = this.installingPlugins.has(entry.name);

		const cardEl = container.createDiv("quartz-syncer-plugin-browser-card");

		const headerEl = cardEl.createDiv(
			"quartz-syncer-plugin-browser-card-header",
		);

		headerEl.createEl("span", {
			text: entry.name,
			cls: "quartz-syncer-plugin-browser-card-name",
		});

		if (entry.official) {
			headerEl.createEl("span", {
				text: "official",
				cls: "quartz-syncer-plugin-browser-badge-official",
			});
		}

		cardEl.createEl("p", {
			text: entry.description,
			cls: "quartz-syncer-plugin-browser-card-desc",
		});

		const footerEl = cardEl.createDiv(
			"quartz-syncer-plugin-browser-card-footer",
		);

		const tagsEl = footerEl.createDiv(
			"quartz-syncer-plugin-browser-card-tags",
		);

		for (const tag of entry.tags) {
			tagsEl.createEl("span", {
				text: tag,
				cls: "quartz-syncer-plugin-browser-tag",
			});
		}

		if (isInstalled) {
			footerEl.createEl("span", {
				text: "Installed",
				cls: "quartz-syncer-plugin-browser-installed",
			});
		} else {
			const installBtn = footerEl.createEl("button", {
				text: isInstalling ? "Installing..." : "Install",
				cls: "quartz-syncer-plugin-browser-install-btn",
			});

			if (isInstalling) {
				installBtn.disabled = true;
			}

			installBtn.addEventListener("click", async () => {
				await this.handleInstall(entry, installBtn);
			});
		}
	}

	private async handleInstall(
		entry: RegistryPluginEntry,
		button: HTMLButtonElement,
	): Promise<void> {
		if (this.installingPlugins.has(entry.name)) return;

		this.installingPlugins.add(entry.name);
		button.textContent = "Installing...";
		button.disabled = true;

		try {
			await this.onInstall(entry.source);
			new Notice(`Plugin "${entry.name}" installed successfully.`);
			this.render();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.warn(`Failed to install ${entry.name}`, error);
			new Notice(`Failed to install "${entry.name}": ${message}`);
			button.textContent = "Install";
			button.disabled = false;
		} finally {
			this.installingPlugins.delete(entry.name);
		}
	}

	private isPluginInstalled(entry: RegistryPluginEntry): boolean {
		const entryKey = getPluginSourceKey(entry.source);

		return this.config.plugins.some(
			(p) => getPluginSourceKey(p.source) === entryKey,
		);
	}

	private getFilteredPlugins(): RegistryPluginEntry[] {
		const query = this.searchQuery.toLowerCase().trim();

		return this.allPlugins.filter((entry) => {
			if (this.selectedTag && !entry.tags.includes(this.selectedTag)) {
				return false;
			}

			if (!query) return true;

			return (
				entry.name.toLowerCase().includes(query) ||
				entry.description.toLowerCase().includes(query) ||
				entry.tags.some((t) => t.toLowerCase().includes(query))
			);
		});
	}

	private getAllTags(): string[] {
		const tagSet = new Set<string>();

		for (const entry of this.allPlugins) {
			for (const tag of entry.tags) {
				tagSet.add(tag);
			}
		}

		return [...tagSet].sort();
	}
}
