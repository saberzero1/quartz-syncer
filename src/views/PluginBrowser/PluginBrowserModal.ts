import { type App, Modal, Notice, setIcon } from "obsidian";
import type {
	QuartzPluginRegistry,
	RegistryPluginEntry,
} from "src/quartz/QuartzPluginRegistry";
import type { QuartzV5Config } from "src/quartz/QuartzConfigTypes";
import { getPluginSourceKey } from "src/quartz/QuartzPluginUtils";

type InstallPluginFn = (source: string) => Promise<void>;
type ViewMode = "card" | "list";
type SortOption = "stars" | "name" | "author" | "updated";
type SourceFilter = "all" | "official" | "community";

export class PluginBrowserModal extends Modal {
	private registry: QuartzPluginRegistry;
	private config: QuartzV5Config;
	private onInstall: InstallPluginFn;
	private allPlugins: RegistryPluginEntry[] = [];
	private searchQuery = "";
	private selectedCategory = "";
	private sourceFilter: SourceFilter = "all";
	private sortBy: SortOption = "stars";
	private viewMode: ViewMode = "card";
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
			this.renderLoadingState();
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
			if (this.viewMode === "list") {
				this.renderPluginRow(listEl, entry);
			} else {
				this.renderPluginCard(listEl, entry);
			}
		}
	}

	private renderLoadingState(): void {
		const wrapper = this.contentEl.createDiv({
			cls: "quartz-syncer-plugin-browser-loading",
		});
		const spinner = wrapper.createSpan({
			cls: "quartz-syncer-plugin-browser-spinner",
		});
		setIcon(spinner, "loader-2");
		spinner.setAttribute("aria-label", "Loading");
		wrapper.createSpan({ text: "Loading plugin registry\u2026" });
	}

	private renderControls(): void {
		const controlsEl = this.contentEl.createDiv(
			"quartz-syncer-plugin-browser-controls",
		);

		const topRow = controlsEl.createDiv(
			"quartz-syncer-plugin-browser-controls-top",
		);

		const searchInput = topRow.createEl("input", {
			type: "text",
			placeholder: "Search plugins\u2026",
			cls: "quartz-syncer-plugin-browser-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		const viewToggle = topRow.createDiv(
			"quartz-syncer-plugin-browser-view-toggle",
		);

		const cardBtn = viewToggle.createEl("button", {
			cls: "quartz-syncer-plugin-browser-view-btn",
		});
		setIcon(cardBtn, "layout-grid");
		cardBtn.setAttribute("aria-label", "Card view");
		cardBtn.classList.toggle("is-active", this.viewMode === "card");
		cardBtn.addEventListener("click", () => {
			this.viewMode = "card";
			cardBtn.classList.add("is-active");
			listBtn.classList.remove("is-active");
			this.renderList();
		});

		const listBtn = viewToggle.createEl("button", {
			cls: "quartz-syncer-plugin-browser-view-btn",
		});
		setIcon(listBtn, "list");
		listBtn.setAttribute("aria-label", "List view");
		listBtn.classList.toggle("is-active", this.viewMode === "list");
		listBtn.addEventListener("click", () => {
			this.viewMode = "list";
			listBtn.classList.add("is-active");
			cardBtn.classList.remove("is-active");
			this.renderList();
		});

		const bottomRow = controlsEl.createDiv(
			"quartz-syncer-plugin-browser-controls-bottom",
		);

		const allCategories = this.getAllCategories();
		if (allCategories.length > 0) {
			const categorySelect = bottomRow.createEl("select", {
				cls: "quartz-syncer-plugin-browser-category-filter",
			});
			categorySelect.createEl("option", {
				text: "All categories",
				value: "",
			});
			for (const category of allCategories) {
				categorySelect.createEl("option", {
					text: category,
					value: category,
				});
			}
			categorySelect.value = this.selectedCategory;
			categorySelect.addEventListener("change", () => {
				this.selectedCategory = categorySelect.value;
				this.renderList();
			});
		}

		const sourceSelect = bottomRow.createEl("select", {
			cls: "quartz-syncer-plugin-browser-source-filter",
		});
		sourceSelect.createEl("option", {
			text: "All sources",
			value: "all",
		});
		sourceSelect.createEl("option", {
			text: "Official",
			value: "official",
		});
		sourceSelect.createEl("option", {
			text: "Community",
			value: "community",
		});
		sourceSelect.value = this.sourceFilter;
		sourceSelect.addEventListener("change", () => {
			this.sourceFilter = sourceSelect.value as SourceFilter;
			this.renderList();
		});

		const sortSelect = bottomRow.createEl("select", {
			cls: "quartz-syncer-plugin-browser-sort",
		});
		sortSelect.createEl("option", { text: "Stars", value: "stars" });
		sortSelect.createEl("option", { text: "Name", value: "name" });
		sortSelect.createEl("option", { text: "Author", value: "author" });
		sortSelect.createEl("option", {
			text: "Recently updated",
			value: "updated",
		});
		sortSelect.value = this.sortBy;
		sortSelect.addEventListener("change", () => {
			this.sortBy = sortSelect.value as SortOption;
			this.renderList();
		});
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
			if (this.viewMode === "list") {
				this.renderPluginRow(listEl, entry);
			} else {
				this.renderPluginCard(listEl, entry);
			}
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

		const metaEl = cardEl.createDiv(
			"quartz-syncer-plugin-browser-card-meta",
		);
		metaEl.createSpan({ text: `by ${entry.author}` });
		metaEl.createSpan({ text: `v${entry.version}` });
		metaEl.createSpan({ text: `\u2605 ${entry.stars}` });

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

		this.renderInstallStatus(footerEl, entry, isInstalled, isInstalling);
	}

	private renderPluginRow(
		container: HTMLElement,
		entry: RegistryPluginEntry,
	): void {
		const isInstalled = this.isPluginInstalled(entry);
		const isInstalling = this.installingPlugins.has(entry.name);

		const rowEl = container.createDiv("quartz-syncer-plugin-browser-row");

		const nameEl = rowEl.createSpan({
			cls: "quartz-syncer-plugin-browser-row-name",
		});
		nameEl.createSpan({ text: entry.displayName });
		if (entry.official) {
			nameEl.createSpan({
				text: "official",
				cls: "quartz-syncer-plugin-browser-badge-official",
			});
		}

		rowEl.createSpan({
			text: entry.author,
			cls: "quartz-syncer-plugin-browser-row-author",
		});
		rowEl.createSpan({
			text: `v${entry.version}`,
			cls: "quartz-syncer-plugin-browser-row-version",
		});
		rowEl.createSpan({
			text: `\u2605 ${entry.stars}`,
			cls: "quartz-syncer-plugin-browser-row-stars",
		});

		const tagsEl = rowEl.createSpan({
			cls: "quartz-syncer-plugin-browser-row-tags",
		});
		const categories = Array.isArray(entry.category)
			? entry.category
			: [entry.category];
		for (const category of categories) {
			tagsEl.createSpan({
				text: category,
				cls: "quartz-syncer-plugin-browser-tag",
			});
		}

		this.renderInstallStatus(rowEl, entry, isInstalled, isInstalling);
	}

	private renderInstallStatus(
		container: HTMLElement,
		entry: RegistryPluginEntry,
		isInstalled: boolean,
		isInstalling: boolean,
	): void {
		if (isInstalled) {
			container.createSpan({
				text: "Installed",
				cls: "quartz-syncer-plugin-browser-installed",
			});
		} else {
			const installBtn = container.createEl("button", {
				text: isInstalling ? "Installing\u2026" : "Install",
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
		button.textContent = "Installing\u2026";
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

		const filtered = this.allPlugins.filter((entry) => {
			if (this.sourceFilter === "official" && !entry.official) {
				return false;
			}
			if (this.sourceFilter === "community" && entry.official) {
				return false;
			}

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

		return this.sortPlugins(filtered);
	}

	private sortPlugins(plugins: RegistryPluginEntry[]): RegistryPluginEntry[] {
		const sorted = [...plugins];

		switch (this.sortBy) {
			case "stars":
				sorted.sort((a, b) => b.stars - a.stars);
				break;
			case "name":
				sorted.sort((a, b) =>
					a.displayName.localeCompare(b.displayName),
				);
				break;
			case "author":
				sorted.sort((a, b) => {
					const authorCmp = a.author.localeCompare(b.author);
					if (authorCmp !== 0) return authorCmp;
					return a.displayName.localeCompare(b.displayName);
				});
				break;
			case "updated":
				sorted.sort((a, b) =>
					b.lastUpdated.localeCompare(a.lastUpdated),
				);
				break;
		}

		return sorted;
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
