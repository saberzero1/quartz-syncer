import { type App, Modal, Notice } from "obsidian";
import type {
	QuartzPluginRegistry,
	RegistryPluginEntry,
} from "src/quartz/QuartzPluginRegistry";
import type { QuartzV5Config } from "src/quartz/QuartzConfigTypes";
import { getPluginSourceKey } from "src/quartz/QuartzPluginUtils";

type InstallPluginFn = (source: string) => Promise<void>;

export class PluginBrowserModal extends Modal {
	private registry: QuartzPluginRegistry;
	private config: QuartzV5Config;
	private onInstall: InstallPluginFn;
	private allPlugins: RegistryPluginEntry[] = [];
	private searchQuery = "";
	private selectedCategory = "";
	private isLoading = false;
	private installingPlugins: Set<string> = new Set();

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
		this.titleEl.setText("Community plugin browser");
		void this.loadAndRender();
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
			console.debug("Failed to load registry", error);
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

		const allCategories = this.getAllCategories();

		if (allCategories.length > 0) {
			const tagSelect = controlsEl.createEl("select", {
				cls: "quartz-syncer-plugin-browser-tag-filter",
			});

			tagSelect.createEl("option", { text: "All categories", value: "" });

			for (const category of allCategories) {
				tagSelect.createEl("option", {
					text: category,
					value: category,
				});
			}

			tagSelect.value = this.selectedCategory;

			tagSelect.addEventListener("change", () => {
				this.selectedCategory = tagSelect.value;
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

		headerEl.createSpan({
			text: entry.displayName,
			cls: "quartz-syncer-plugin-browser-card-name",
		});

		if (entry.official) {
			headerEl.createSpan({
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

		const categoriesEl = footerEl.createDiv(
			"quartz-syncer-plugin-browser-card-tags",
		);

		const categories = Array.isArray(entry.category)
			? entry.category
			: [entry.category];
		for (const category of categories) {
			categoriesEl.createSpan({
				text: category,
				cls: "quartz-syncer-plugin-browser-tag",
			});
		}

		if (isInstalled) {
			footerEl.createSpan({
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

			installBtn.addEventListener("click", () => {
				void this.handleInstall(entry, installBtn);
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
			console.debug(`Failed to install ${entry.name}`, error);
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
			if (this.selectedCategory) {
				const categories = Array.isArray(entry.category)
					? entry.category
					: [entry.category];
				if (!categories.includes(this.selectedCategory)) {
					return false;
				}
			}

			if (!query) return true;

			return (
				entry.displayName.toLowerCase().includes(query) ||
				entry.description.toLowerCase().includes(query) ||
				(entry.keywords ?? []).some((kw) =>
					kw.toLowerCase().includes(query),
				)
			);
		});
	}

	private getAllCategories(): string[] {
		const categorySet = new Set<string>();

		for (const entry of this.allPlugins) {
			const categories = Array.isArray(entry.category)
				? entry.category
				: [entry.category];
			for (const category of categories) {
				categorySet.add(category);
			}
		}

		return [...categorySet].sort();
	}
}
