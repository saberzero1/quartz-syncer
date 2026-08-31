import {
	arrayBufferToBase64,
	FuzzySuggestModal,
	Modal,
	Notice,
	Platform,
	setIcon,
	TFile,
} from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { StatusSnapshot } from "src/services/StatusCacheService";
import type {
	ArbitraryFileEntry,
	MediaEntry,
	PublishStatus,
} from "src/publisher/types";
import { isMediaFile, isTextMediaFile } from "src/utils/mediaTypes";
import { DiffModal } from "src/views/DiffView/DiffModal";
import {
	computeDiffStats,
	expandAllCollapsed,
	getCollapseState,
	collapseAll,
	renderDiffView,
	type DiffViewMode,
} from "src/views/DiffView/DiffRenderer";
import { ManualSetupModal } from "src/views/ManualSetupModal";
import { OnboardingWizard } from "src/views/OnboardingWizard/OnboardingWizard";
import { PublicationTree } from "src/views/PublicationCenter/TreeRenderer";
import {
	type SelectableCategory,
	type TreeTab,
	TreeState,
} from "src/views/PublicationCenter/TreeState";
import { qsDom } from "src/operability/DomContract";

type ProgressState = {
	current: number;
	total: number;
};

export interface PublicationCenterController {
	getSelected(): string[];
	setSelected(paths: string[]): void;
	selectAll(): void;
	deselectAll(): void;
	triggerPublish(): Promise<void>;
	triggerDelete(): Promise<void>;
	close(): void;
}

export class PublicationCenter extends Modal {
	private status: PublishStatus | null = null;
	private treeState = new TreeState();
	private progressState: ProgressState = { current: 0, total: 0 };
	private progressIndicatorEl: HTMLDivElement | null = null;
	private publishButtonEl: HTMLButtonElement | null = null;
	private deleteButtonEl: HTMLButtonElement | null = null;
	private treeContainerEl: HTMLDivElement | null = null;
	private overviewEl: HTMLDivElement | null = null;
	private diffInlineEl: HTMLDivElement | null = null;
	private diffContentEl: HTMLDivElement | null = null;
	private publicationTree: PublicationTree | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private filterDebounceTimer: number | null = null;
	private hasShell = false;
	private isOperating = false;
	private isRefreshing = false;
	private hasFullStatus = false;
	private fileMap = new Map<string, PublishFile>();
	private mediaMap = new Map<string, MediaEntry>();
	private arbitraryMap = new Map<string, ArbitraryFileEntry>();
	private mediaSources = new Map<string, Set<string>>();
	private tabButtons = new Map<TreeTab, HTMLButtonElement>();
	private diffMode: DiffViewMode = "split";
	private inlineScrollSync: ReturnType<typeof renderDiffView> = null;
	private diffStatsAbort: AbortController | null = null;
	private refreshingEl: HTMLSpanElement | null = null;

	constructor(
		app: App,
		private _plugin: QuartzSyncer,
	) {
		super(app);
	}

	onOpen(): void {
		this._plugin
			.getEventSink()
			?.emit("ui.modal.opened", { name: "publication-center" });
		this.modalEl.addClass("qs-pub-center");
		this.modalEl.setAttrs(qsDom("pub-center"));
		this.contentEl.empty();
		this.titleEl.setText("Publication Center");
		this.renderLoadingState();

		this._plugin.pauseAutoPublish();

		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});

		const container = this.modalEl.parentElement;
		if (container) {
			container.addEventListener("click", (event) => {
				if (event.target === container) {
					this.close();
				}
			});
		}

		void this.loadStatus();
	}

	onClose(): void {
		this._plugin
			.getEventSink()
			?.emit("ui.modal.closed", { name: "publication-center" });
		this._plugin.resumeAutoPublish();
		this.diffStatsAbort?.abort();
		this.diffStatsAbort = null;
		this.publicationTree?.unmount();
		this.inlineScrollSync?.destroy();
		this.inlineScrollSync = null;
		this.contentEl.empty();
		this.progressIndicatorEl = null;
		this.publishButtonEl = null;
		this.deleteButtonEl = null;
		this.treeContainerEl = null;
		this.overviewEl = null;
		this.diffInlineEl = null;
		this.diffContentEl = null;
		this.refreshingEl = null;
		this.searchInputEl = null;
		this.publicationTree = null;
		this.fileMap.clear();
		this.mediaMap.clear();
		this.arbitraryMap.clear();
		this.mediaSources.clear();
		this.tabButtons.clear();
		if (this.filterDebounceTimer !== null) {
			window.clearTimeout(this.filterDebounceTimer);
			this.filterDebounceTimer = null;
		}
		this.hasShell = false;
		this.isRefreshing = false;
		this.hasFullStatus = false;
	}

	getController(): PublicationCenterController {
		return {
			getSelected: () => this.treeState.getSelectedFiles(),
			setSelected: (paths: string[]) => {
				this.treeState.deselectAll();
				for (const path of paths) {
					if (this.treeState.hasFile(path)) {
						this.treeState.selectFile(path);
					}
				}
				this.updateTreeState();
			},
			selectAll: () => {
				for (const category of this.treeState.getVisibleCategories()) {
					this.treeState.selectAll(category);
				}
				this.updateTreeState();
			},
			deselectAll: () => {
				this.treeState.deselectAll();
				this.updateTreeState();
			},
			triggerPublish: () => this.handlePublish(),
			triggerDelete: () => this.handleDelete(),
			close: () => this.close(),
		};
	}

	private renderLoadingState(): void {
		const wrapper = this.contentEl.createDiv({ cls: "pub-center-loading" });
		const spinner = wrapper.createSpan({ cls: "pub-center-spinner" });
		setIcon(spinner, "loader-2");
		spinner.setAttribute("aria-label", "Loading");
		wrapper.createSpan({ text: "Loading publish status…" });
	}

	private async loadStatus(): Promise<void> {
		this.diffStatsAbort?.abort();
		this._plugin.statusCache.clearDiffCache();

		const publisher = this._plugin.getPublisher();
		if (!publisher) {
			this.status = null;
			this.progressState = { current: 0, total: 0 };
			this.treeState.setKnownFiles([]);
			this.treeState.setLinkedMediaFiles(new Map());
			this.mediaSources.clear();
			this.renderShell(true);
			this.updateTreeState();
			return;
		}

		const cached = this._plugin.statusCache.getCachedStatusEvenIfStale();

		if (cached && this.isCachedStatusValid(cached)) {
			this.hasFullStatus = true;
			this.status = cached;
			this.progressState = { current: 0, total: 0 };
			this.buildFileMap();
			await this.buildMediaLinksMap();
			this.treeState.setKnownFiles(this.getKnownFilePaths());
			this.renderShell(true);
			this.updateTreeState();

			void this.refreshStatusInBackground(publisher);
			return;
		}

		const snapshot = this._plugin.statusCache.getSnapshot();

		if (snapshot) {
			this.hasFullStatus = false;
			this.isRefreshing = true;
			this.status = this.statusFromSnapshot(snapshot);
			this.progressState = { current: 0, total: 0 };
			this.buildFileMap();
			this.buildMediaLinksFromSnapshot(snapshot);
			this.treeState.setKnownFiles(this.getKnownFilePaths());
			this.renderShell(true);
			this.updateTreeState();
			this.updateOperationButtons();

			void this.refreshStatusInBackground(publisher);
			return;
		}

		try {
			this.status = await this.fetchAndCacheStatus(publisher);
			this.hasFullStatus = true;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to load publish status: ${message}`);
			this.status = null;
		}
		this.progressState = { current: 0, total: 0 };
		this.buildFileMap();
		await this.buildMediaLinksMap();
		this.treeState.setKnownFiles(this.getKnownFilePaths());
		this.renderShell(true);
		this.updateTreeState();
	}

	private async fetchAndCacheStatus(
		publisher: ReturnType<QuartzSyncer["getPublisher"]> & object,
	): Promise<PublishStatus> {
		const statusCache = this._plugin.statusCache;
		let inflight = statusCache.getInflight();

		if (!inflight) {
			inflight = publisher.getPublishStatus();
			statusCache.setInflight(inflight);
		}

		try {
			const status = await inflight;
			statusCache.setStatus(status);
			return status;
		} finally {
			statusCache.clearInflight();
		}
	}

	private async refreshStatusInBackground(
		publisher: ReturnType<QuartzSyncer["getPublisher"]> & object,
	): Promise<void> {
		this.isRefreshing = true;
		this.refreshingEl?.removeClass("qs-hidden");
		this.updateOperationButtons();

		try {
			const fresh = await this.fetchAndCacheStatus(publisher);
			this.status = fresh;
			this.hasFullStatus = true;
			const selectedPaths = this.treeState.getSelectedFiles();
			this.diffStatsAbort?.abort();
			this._plugin.statusCache.clearDiffCache();
			this.progressState = { current: 0, total: 0 };
			this.buildFileMap();
			await this.buildMediaLinksMap();
			this.treeState.setKnownFiles(this.getKnownFilePaths());
			this.renderShell(true);
			this.updateTreeState();

			for (const path of selectedPaths) {
				if (this.treeState.hasFile(path)) {
					this.treeState.selectFile(path);
				}
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.error("Failed to refresh publish status:", message);
			new Notice(`Failed to refresh publish status: ${message}`);
		} finally {
			this.isRefreshing = false;
			this.refreshingEl?.addClass("qs-hidden");
			this.updateOperationButtons();
		}
	}

	private statusFromSnapshot(snapshot: StatusSnapshot): PublishStatus {
		const stub = (path: string) =>
			({
				file: { path },
				getVaultPath: () => path,
			}) as unknown as PublishFile;

		return {
			unpublished: snapshot.unpublished.map(stub),
			changed: snapshot.changed.map(stub),
			published: snapshot.published.map(stub),
			deleted: [...snapshot.deleted],
			media: [...snapshot.media],
			arbitrary: [...snapshot.arbitrary],
			mediaLinks: new Map(Object.entries(snapshot.mediaLinks)),
		};
	}

	private buildMediaLinksFromSnapshot(snapshot: StatusSnapshot): void {
		this.mediaSources.clear();
		const linked = new Map<string, Set<string>>();

		for (const [notePath, links] of Object.entries(snapshot.mediaLinks)) {
			if (links.length === 0) continue;
			const linkSet = new Set(links);
			linked.set(notePath, linkSet);
			for (const link of linkSet) {
				const sources = this.mediaSources.get(link) ?? new Set();
				sources.add(notePath);
				this.mediaSources.set(link, sources);
			}
		}

		this.treeState.setLinkedMediaFiles(linked);
	}

	private isCachedStatusValid(status: PublishStatus): boolean {
		const vault = this.app.vault;
		const fileArrays = [
			status.unpublished,
			status.changed,
			status.published,
		];

		for (const files of fileArrays) {
			for (const file of files) {
				if (!vault.getFileByPath(file.file.path)) {
					return false;
				}
			}
		}

		return true;
	}

	private buildFileMap(): void {
		this.fileMap.clear();
		this.mediaMap.clear();
		this.arbitraryMap.clear();

		if (!this.status) return;

		for (const file of this.status.unpublished) {
			this.fileMap.set(file.getVaultPath(), file);
		}

		for (const file of this.status.changed) {
			this.fileMap.set(file.getVaultPath(), file);
		}

		for (const file of this.status.published) {
			this.fileMap.set(file.getVaultPath(), file);
		}

		for (const entry of this.status.media) {
			this.mediaMap.set(entry.vaultPath, entry);
		}

		for (const entry of this.status.arbitrary) {
			this.arbitraryMap.set(entry.vaultPath, entry);
		}
	}

	private renderShell(force = false): void {
		if (this.hasShell && !force) return;
		this.hasShell = true;
		this.publicationTree?.unmount();
		this.publicationTree = null;
		this.inlineScrollSync?.destroy();
		this.inlineScrollSync = null;
		this.tabButtons.clear();
		this.searchInputEl = null;
		this.treeContainerEl = null;
		this.overviewEl = null;
		this.diffInlineEl = null;
		this.diffContentEl = null;

		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: "pub-center-header" });
		const pluginName = this._plugin.manifest.name ?? "Quartz Syncer";
		header.createSpan({
			text: `Select notes to publish or delete with ${pluginName}.`,
		});

		this.refreshingEl = header.createSpan({
			cls: "pub-center-refreshing",
		});
		setIcon(this.refreshingEl, "refresh-cw");
		this.refreshingEl.createSpan({ text: " Refreshing\u2026" });

		if (!this.isRefreshing) {
			this.refreshingEl.addClass("qs-hidden");
		}

		if (
			this._plugin.settings.allowArbitraryFilePublishing &&
			this.treeState.tab === "advanced"
		) {
			const addButton = header.createEl("button", {
				text: "Add file",
				cls: "mod-cta",
			});
			addButton.addEventListener("click", () => {
				this.openArbitraryFilePicker();
			});
		}

		const tabs = this.contentEl.createDiv({ cls: "pub-center-tabs" });
		const publishTab = tabs.createEl("button", {
			cls: "pub-center-tab",
			text: "Publish",
		});
		publishTab.dataset.tab = "publish";
		publishTab.setAttrs(qsDom("pub-tab", { value: "publish" }));
		publishTab.addEventListener("click", () => {
			this.switchTab("publish");
		});
		const advancedTab = tabs.createEl("button", {
			cls: "pub-center-tab",
			text: "Advanced",
		});
		advancedTab.dataset.tab = "advanced";
		advancedTab.setAttrs(qsDom("pub-tab", { value: "advanced" }));
		advancedTab.addEventListener("click", () => {
			this.switchTab("advanced");
		});
		this.tabButtons.set("publish", publishTab);
		this.tabButtons.set("advanced", advancedTab);
		this.updateTabButtons();

		const body = this.contentEl.createDiv({ cls: "pub-center-body" });
		const leftColumn = body.createDiv({ cls: "pub-center-column-left" });

		this.searchInputEl = leftColumn.createEl("input", {
			type: "text",
			cls: "tree-search-input",
			placeholder: "Filter by file name\u2026",
			value: this.treeState.filterText,
		});
		this.searchInputEl.setAttribute("aria-label", "Filter files");
		this.searchInputEl.setAttrs(qsDom("pub-search"));
		this.searchInputEl.addEventListener("input", () => {
			if (this.filterDebounceTimer !== null) {
				window.clearTimeout(this.filterDebounceTimer);
			}

			this.filterDebounceTimer = window.setTimeout(() => {
				this.treeState.filterText = this.searchInputEl?.value ?? "";
				this.updateTreeState();
				this.filterDebounceTimer = null;
			}, 200);
		});

		this.treeContainerEl = leftColumn.createDiv({
			cls: "pub-center-tree",
		});

		if (this.status) {
			this.publicationTree = new PublicationTree(
				this.treeContainerEl,
				this.treeState,
				{
					onFileClick: (path) => void this.openDiff(path),
					onStateChange: () => this.updateTreeState(),
				},
			);
			this.publicationTree.mount(this.status);
		} else {
			this.renderEmptyState();
		}

		if (Platform.isDesktopApp) {
			const rightColumn = body.createDiv({
				cls: "pub-center-column-right",
			});
			this.overviewEl = rightColumn.createDiv({
				cls: "pub-center-overview",
			});
			this.diffInlineEl = rightColumn.createDiv({
				cls: "pub-center-diff-inline qs-hidden qs-diff-view",
			});
		}

		const footer = this.contentEl.createDiv({ cls: "pub-center-footer" });
		const progress = footer.createDiv({ cls: "progress-bar" });
		this.progressIndicatorEl = progress.createDiv({
			cls: "progress-bar-indicator",
		});
		this.progressIndicatorEl.setAttrs(qsDom("pub-progress"));
		this.updateProgress();

		const actions = footer.createDiv({ cls: "pub-center-actions" });
		this.publishButtonEl = actions.createEl("button", {
			cls: "mod-cta",
			text: "Publish",
		});
		this.publishButtonEl.setAttrs(qsDom("pub-publish-btn"));
		this.publishButtonEl.disabled = this.isOperating;
		this.publishButtonEl.addEventListener("click", () => {
			void this.handlePublish();
		});

		this.deleteButtonEl = actions.createEl("button", {
			cls: "mod-warning",
			text: "Delete",
		});
		this.deleteButtonEl.setAttrs(qsDom("pub-delete-btn"));
		this.deleteButtonEl.disabled = this.isOperating;
		this.deleteButtonEl.addEventListener("click", () => {
			void this.handleDelete();
		});

		this.diffMode = this.getDefaultDiffMode();
		if (this.status && this.publicationTree) {
			void this.computeTreeDiffStats();
		}
	}

	private updateTreeState(): void {
		this.publicationTree?.update();
		if (this.overviewEl && Platform.isDesktopApp) {
			this.renderOverview();
		}
	}

	private switchTab(tab: TreeTab): void {
		if (this.treeState.tab === tab) return;
		this.treeState.tab = tab;
		this.renderShell(true);
		this.updateTreeState();
	}

	private updateTabButtons(): void {
		for (const [tab, button] of this.tabButtons) {
			button.classList.toggle("is-active", tab === this.treeState.tab);
		}
	}

	private renderEmptyState(): void {
		if (!this.treeContainerEl) return;
		this.treeContainerEl.empty();
		const emptyEl = this.treeContainerEl.createDiv({
			cls: "pub-center-empty",
		});
		const iconEl = emptyEl.createSpan({ cls: "pub-center-empty-icon" });
		setIcon(iconEl, "settings");
		emptyEl.createEl("p", { text: "No repository configured." });
		const setupBtn = emptyEl.createEl("button", {
			cls: "mod-cta",
			text: Platform.isDesktopApp
				? "Open setup wizard"
				: "Open manual setup",
		});
		setupBtn.addEventListener("click", () => {
			this.close();
			if (Platform.isDesktopApp) {
				new OnboardingWizard(this.app, this._plugin).open();
			} else {
				new ManualSetupModal(this.app, this._plugin).open();
			}
		});
	}

	private getDefaultDiffMode(): DiffViewMode {
		const style = this._plugin.settings.diffViewStyle ?? "auto";
		if (style === "auto") {
			return Platform.isDesktopApp ? "split" : "unified";
		}
		return style;
	}

	private async buildMediaLinksMap(): Promise<void> {
		this.mediaSources.clear();
		if (!this.status) {
			this.treeState.setLinkedMediaFiles(new Map());
			return;
		}

		const linked = new Map<string, Set<string>>();

		if (this.status.mediaLinks && this.status.mediaLinks.size > 0) {
			for (const [notePath, links] of this.status.mediaLinks) {
				if (links.length === 0) continue;
				const linkSet = new Set(links);
				linked.set(notePath, linkSet);
				for (const link of linkSet) {
					const sources = this.mediaSources.get(link) ?? new Set();
					sources.add(notePath);
					this.mediaSources.set(link, sources);
				}
			}
		} else {
			const files = [
				...this.status.unpublished,
				...this.status.changed,
				...this.status.published,
			];
			const entries = await Promise.all(
				files.map(async (file) => {
					const path = file.getVaultPath();
					const links =
						await this._plugin.dataStore.loadMediaLinks(path);
					return { path, links };
				}),
			);
			for (const entry of entries) {
				if (entry.links.length === 0) continue;
				const linkSet = new Set(entry.links);
				linked.set(entry.path, linkSet);
				for (const link of linkSet) {
					const sources = this.mediaSources.get(link) ?? new Set();
					sources.add(entry.path);
					this.mediaSources.set(link, sources);
				}
			}
		}

		this.treeState.setLinkedMediaFiles(linked);
	}

	private getKnownFilePaths(): string[] {
		if (!this.status) return [];
		const paths = new Set<string>();
		for (const file of this.status.unpublished) {
			paths.add(file.getVaultPath());
		}
		for (const file of this.status.changed) {
			paths.add(file.getVaultPath());
		}
		for (const file of this.status.published) {
			paths.add(file.getVaultPath());
		}
		for (const path of this.status.deleted) {
			paths.add(path);
		}
		for (const entry of this.status.media) {
			paths.add(entry.vaultPath);
		}
		for (const entry of this.status.arbitrary) {
			paths.add(entry.vaultPath);
		}
		return [...paths];
	}

	private renderOverview(): void {
		if (!this.overviewEl) return;
		this.overviewEl.empty();
		const selected = this.treeState.getSelectedFiles();
		if (selected.length === 0) {
			this.overviewEl.createDiv({
				cls: "pub-center-overview-empty",
				text: "Select files to see a summary of changes.",
			});
			return;
		}

		const publishing: string[] = [];
		const deleting: string[] = [];
		const media: string[] = [];

		for (const path of selected) {
			if (this.mediaMap.has(path) || this.mediaSources.has(path)) {
				media.push(path);
				continue;
			}
			const category = this.treeState.getCategory(path);
			if (category === "deleted" || category === "published") {
				deleting.push(path);
				continue;
			}
			if (
				category === "unpublished" ||
				category === "changed" ||
				category === "arbitrary"
			) {
				publishing.push(path);
			}
		}

		const hasAny =
			publishing.length > 0 || media.length > 0 || deleting.length > 0;
		if (!hasAny) {
			this.overviewEl.createDiv({
				cls: "pub-center-overview-empty",
				text: "Select files to see a summary of changes.",
			});
			return;
		}

		this.renderOverviewGroup("Publishing", publishing, (item, path) => {
			item.setText(path);
		});
		this.renderOverviewGroup("Including media", media, (item, path) => {
			item.setText(path);
			const sources = this.mediaSources.get(path);
			if (sources && sources.size > 0) {
				const sourceText = Array.from(sources).join(", ");
				item.createSpan({
					cls: "pub-center-overview-media-source",
					text: ` (from ${sourceText})`,
				});
			}
		});
		this.renderOverviewGroup("Deleting", deleting, (item, path) => {
			item.setText(path);
		});
	}

	private renderOverviewGroup(
		title: string,
		items: string[],
		renderItem: (item: HTMLDivElement, path: string) => void,
	): void {
		if (!this.overviewEl || items.length === 0) return;
		const group = this.overviewEl.createDiv({
			cls: "pub-center-overview-group",
		});
		group.createDiv({
			cls: "pub-center-overview-heading",
			text: title,
		});
		for (const path of items) {
			const item = group.createDiv({ cls: "pub-center-overview-item" });
			renderItem(item, path);
		}
	}

	private renderInlineDiff(
		path: string,
		localContent: string,
		remoteContent: string,
		category: SelectableCategory | undefined,
	): void {
		if (!this.diffInlineEl || !this.overviewEl) return;
		this.overviewEl.addClass("qs-hidden");
		this.diffInlineEl.removeClass("qs-hidden");
		this.diffInlineEl.empty();
		this.inlineScrollSync?.destroy();
		this.inlineScrollSync = null;

		const backButton = this.diffInlineEl.createEl("button", {
			cls: "pub-center-diff-back",
			text: "Back to overview",
		});
		backButton.addEventListener("click", () => {
			this.inlineScrollSync?.destroy();
			this.inlineScrollSync = null;
			this.diffInlineEl?.addClass("qs-hidden");
			this.overviewEl?.removeClass("qs-hidden");
			this.diffContentEl = null;
		});

		const header = this.diffInlineEl.createDiv({ cls: "diff-header" });
		header.createSpan({ text: path });

		const stats = computeDiffStats(localContent, remoteContent);
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
		const splitButton = controls.createEl("button", { text: "Split" });
		const unifiedButton = controls.createEl("button", { text: "Unified" });
		const collapseButton = controls.createEl("button", {
			text: "Expand all",
		});
		const forceUnified =
			category === "unpublished" || category === "deleted";
		splitButton.style.display = forceUnified ? "none" : "";
		unifiedButton.style.display = forceUnified ? "none" : "";
		if (forceUnified) {
			this.diffMode = "unified";
		}
		const updateButtons = () => {
			splitButton.classList.toggle(
				"is-active",
				this.diffMode === "split",
			);
			unifiedButton.classList.toggle(
				"is-active",
				this.diffMode === "unified",
			);
		};
		const updateCollapseButton = () => {
			if (!this.diffContentEl) return;
			const state = getCollapseState(this.diffContentEl);
			collapseButton.disabled = !state.hasRegions;
			collapseButton.textContent = state.hasRegions
				? state.hasCollapsed
					? "Expand all"
					: "Collapse all"
				: "Expand all";
		};
		const renderContent = () => {
			this.diffContentEl?.remove();
			this.diffContentEl = this.diffInlineEl
				? this.diffInlineEl.createDiv({ cls: "diff-content" })
				: null;
			if (!this.diffContentEl) return;
			this.diffContentEl.addEventListener(
				"qs-diff-collapse-change",
				() => {
					updateCollapseButton();
				},
			);
			this.inlineScrollSync?.destroy();
			this.inlineScrollSync = renderDiffView(
				this.diffContentEl,
				localContent,
				remoteContent,
				this.diffMode,
				this._plugin.settings.diffContextLines,
			);
			updateCollapseButton();
		};
		collapseButton.addEventListener("click", () => {
			if (!this.diffContentEl) return;
			const state = getCollapseState(this.diffContentEl);
			if (!state.hasRegions) return;
			if (state.hasCollapsed) {
				expandAllCollapsed(this.diffContentEl);
			} else {
				collapseAll(this.diffContentEl);
			}
			updateCollapseButton();
		});
		splitButton.addEventListener("click", () => {
			this.diffMode = "split";
			updateButtons();
			renderContent();
		});
		unifiedButton.addEventListener("click", () => {
			this.diffMode = "unified";
			updateButtons();
			renderContent();
		});
		updateButtons();
		renderContent();
	}

	private async resolveDiffContent(path: string): Promise<{
		localContent: string;
		remoteContent: string;
		category: SelectableCategory | undefined;
	} | null> {
		const publisher = this._plugin.getPublisher();

		if (!publisher) {
			new Notice(
				"Configure your git repository in settings to get started.",
			);
			return null;
		}

		const category = this.treeState.getCategory(path);

		if (category === "published") {
			new Notice("No changes to display.");
			return null;
		}

		if (category === "arbitrary") {
			new Notice("Diffs are not available for custom files.");
			return null;
		}

		const cached = this._plugin.statusCache.getDiffContent(path);

		if (cached) {
			return {
				localContent: cached.local,
				remoteContent: cached.remote,
				category,
			};
		}

		let localContent = "";
		let remoteContent = "";

		try {
			if (category === "deleted") {
				remoteContent =
					(await publisher.getRemoteFileContent(path)) ?? "";
			} else if (category?.startsWith("media-")) {
				if (isTextMediaFile(path)) {
					const file = this.app.vault.getFileByPath(path);
					if (file) {
						localContent = await this.app.vault.read(file);
					}
					remoteContent =
						(await publisher.getRemoteFileContent(path)) ?? "";
				}
			} else {
				const file = this.fileMap.get(path);

				if (file) {
					localContent =
						(await publisher.getLocalCompiledContent(file)) ?? "";
				}

				if (category === "changed") {
					remoteContent =
						(await publisher.getRemoteFileContent(path)) ?? "";
				}
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.error("Failed to load file content for diff:", message);
			new Notice(`Failed to load file content for diff: ${message}`);
			return null;
		}

		if (!localContent && !remoteContent) {
			new Notice(
				"No content available for diff. Try refreshing publish status.",
			);
			return null;
		}

		if (localContent || remoteContent) {
			this._plugin.statusCache.cacheDiffContent(
				path,
				localContent,
				remoteContent,
			);
		}

		return { localContent, remoteContent, category };
	}

	private async computeTreeDiffStats(): Promise<void> {
		this.diffStatsAbort?.abort();

		const abort = new AbortController();
		this.diffStatsAbort = abort;

		const publisher = this._plugin.getPublisher();
		if (!publisher || !this.status) return;

		const changed = this.status.changed;
		const chunkSize = 5;

		for (let i = 0; i < changed.length; i += chunkSize) {
			if (abort.signal.aborted || !this.publicationTree) return;

			const chunk = changed.slice(i, i + chunkSize);

			for (const file of chunk) {
				if (abort.signal.aborted || !this.publicationTree) return;

				const vaultPath = file.getVaultPath();
				const localContent =
					(await publisher.getLocalCompiledContent(file)) ?? "";
				const remoteContent =
					(await publisher.getRemoteFileContent(vaultPath)) ?? "";

				if (abort.signal.aborted || !this.publicationTree) return;

				if (localContent || remoteContent) {
					this._plugin.statusCache.cacheDiffContent(
						vaultPath,
						localContent,
						remoteContent,
					);
				}

				const stats = computeDiffStats(localContent, remoteContent);
				this.publicationTree.updateFileStats(
					vaultPath,
					stats.added,
					stats.removed,
				);
			}

			if (i + chunkSize < changed.length) {
				await new Promise<void>((r) => window.setTimeout(r, 0));
			}
		}
	}

	private async openDiff(path: string): Promise<void> {
		const diffData = await this.resolveDiffContent(path);
		if (!diffData) return;

		if (Platform.isDesktopApp && this.diffInlineEl && this.overviewEl) {
			this.renderInlineDiff(
				path,
				diffData.localContent,
				diffData.remoteContent,
				diffData.category,
			);
			return;
		}

		new DiffModal(
			this.app,
			{
				filePath: path,
				localContent: diffData.localContent,
				remoteContent: diffData.remoteContent,
				category: diffData.category,
				diffViewStyle: this._plugin.settings.diffViewStyle,
				contextLines: this._plugin.settings.diffContextLines,
			},
			this._plugin.getEventSink() ?? undefined,
		).open();
	}

	private async handlePublish(): Promise<void> {
		if (this.isOperating) return;

		const publisher = this._plugin.getPublisher();
		if (!publisher || !this.status) {
			new Notice(
				"Configure your git repository in settings to get started.",
			);
			return;
		}

		const selected = this.treeState.getSelectedFiles();
		const publishable = selected.filter((path) => {
			const category = this.treeState.getCategory(path);
			return category === "unpublished" || category === "changed";
		});
		const arbitrarySelected = selected.filter(
			(path) => this.treeState.getCategory(path) === "arbitrary",
		);

		if (publishable.length === 0 && arbitrarySelected.length === 0) {
			new Notice("No files selected for publishing.");
			return;
		}

		this.setOperating(true);
		this.progressState = {
			current: 0,
			total: publishable.length + arbitrarySelected.length,
		};
		this.updateProgress();

		const publishPaths = new Set(publishable);
		const publishFiles = [
			...this.status.unpublished,
			...this.status.changed,
		].filter((file) => publishPaths.has(file.getVaultPath()));

		try {
			if (publishFiles.length > 0) {
				const result = await publisher.publishBatch(
					publishFiles,
					"Published via Quartz Syncer",
					(current) => {
						this.progressState = {
							current,
							total:
								publishable.length + arbitrarySelected.length,
						};
						this.updateProgress();
					},
				);

				if (!result.success) {
					new Notice(
						`Publish failed: ${result.error ?? "Unknown error"}`,
					);
					return;
				}
				this.progressState = {
					current: publishable.length,
					total: publishable.length + arbitrarySelected.length,
				};
				this.updateProgress();
			}

			if (arbitrarySelected.length > 0) {
				const arbitraryFiles = [] as Array<{
					repoPath: string;
					content: string | Uint8Array;
					encoding: "utf-8" | "base64";
				}>;

				for (const path of arbitrarySelected) {
					const file = this.app.vault.getFileByPath(path);
					if (!file) {
						throw new Error(`File not found: ${path}`);
					}

					if (isMediaFile(path) && !isTextMediaFile(path)) {
						const data = await this.app.vault.readBinary(file);
						arbitraryFiles.push({
							repoPath: path,
							content: arrayBufferToBase64(data),
							encoding: "base64",
						});
					} else {
						const content = await this.app.vault.read(file);
						arbitraryFiles.push({
							repoPath: path,
							content,
							encoding: "utf-8",
						});
					}
				}

				const result = await publisher.publishArbitraryFiles(
					arbitraryFiles,
					"Published via Quartz Syncer",
				);

				if (!result.success) {
					new Notice(
						`Publish failed: ${result.error ?? "Unknown error"}`,
					);
					return;
				}
				this.progressState = {
					current: publishable.length + arbitrarySelected.length,
					total: publishable.length + arbitrarySelected.length,
				};
				this.updateProgress();
			}

			const totalPublished =
				publishable.length + arbitrarySelected.length;
			new Notice(`Published ${totalPublished} file(s).`);
			await this.loadStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Publish failed: ${message}`);
		} finally {
			this.setOperating(false);
		}
	}

	private async handleDelete(): Promise<void> {
		if (this.isOperating) return;

		const publisher = this._plugin.getPublisher();
		if (!publisher || !this.status) {
			new Notice(
				"Configure your git repository in settings to get started.",
			);
			return;
		}

		const selected = this.treeState.getSelectedFiles();
		const noteDeletions = selected.filter((path) => {
			const category = this.treeState.getCategory(path);
			return category === "deleted" || category === "published";
		});
		const repoDeletions: string[] = [];

		for (const path of selected) {
			const category = this.treeState.getCategory(path);

			if (category === "media-linked" || category === "media-unlinked") {
				const entry = this.mediaMap.get(path);
				if (entry) {
					repoDeletions.push(entry.repoPath);
				}
			}

			if (category === "arbitrary") {
				repoDeletions.push(path);
			}
		}

		if (noteDeletions.length === 0 && repoDeletions.length === 0) {
			new Notice("No files selected for deletion.");
			return;
		}

		this.setOperating(true);
		this.progressState = {
			current: 0,
			total: noteDeletions.length + repoDeletions.length,
		};
		this.updateProgress();

		try {
			let deletedCount = 0;

			if (noteDeletions.length > 0) {
				const result = await publisher.deleteBatch(
					noteDeletions,
					"Deleted via Quartz Syncer",
					(current) => {
						this.progressState = {
							current,
							total: noteDeletions.length + repoDeletions.length,
						};
						this.updateProgress();
					},
				);

				if (!result.success) {
					new Notice(
						`Delete failed: ${result.error ?? "Unknown error"}`,
					);
					return;
				}
				deletedCount += result.filesDeleted;
				this.progressState = {
					current: noteDeletions.length,
					total: noteDeletions.length + repoDeletions.length,
				};
				this.updateProgress();
			}

			if (repoDeletions.length > 0) {
				const result = await publisher.deleteByRepoPaths(
					repoDeletions,
					"Deleted via Quartz Syncer",
					(current) => {
						this.progressState = {
							current: noteDeletions.length + current,
							total: noteDeletions.length + repoDeletions.length,
						};
						this.updateProgress();
					},
				);

				if (!result.success) {
					new Notice(
						`Delete failed: ${result.error ?? "Unknown error"}`,
					);
					return;
				}
				deletedCount += result.filesDeleted;
			}

			new Notice(`Deleted ${deletedCount} file(s).`);
			await this.loadStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Delete failed: ${message}`);
		} finally {
			this.setOperating(false);
		}
	}

	private openArbitraryFilePicker(): void {
		if (typeof FuzzySuggestModal !== "function") {
			new Notice("File picker is unavailable in this environment.");
			return;
		}

		const files = this.app.vault.getFiles();

		const ArbitraryFilePicker = class extends FuzzySuggestModal<TFile> {
			constructor(
				app: App,
				private pickerFiles: TFile[],
				private onSelect: (file: TFile) => void,
			) {
				super(app);
			}

			getItems(): TFile[] {
				return this.pickerFiles;
			}

			getItemText(file: TFile): string {
				return file.path;
			}

			onChooseItem(file: TFile): void {
				this.onSelect(file);
			}
		};

		new ArbitraryFilePicker(this.app, files, (file) => {
			void this.addArbitraryFilePath(file.path);
		}).open();
	}

	private async addArbitraryFilePath(path: string): Promise<void> {
		if (this.isArbitraryPathDenied(path)) {
			new Notice("That file is not eligible for custom publishing.");
			return;
		}

		const existing = this._plugin.settings.arbitraryPublishPaths;
		if (existing.includes(path)) {
			new Notice("That file is already in the custom publish list.");
			return;
		}

		this._plugin.settings.arbitraryPublishPaths = [...existing, path];
		await this._plugin.saveSettings();
		await this.loadStatus();
	}

	private isArbitraryPathDenied(path: string): boolean {
		const normalized = path.replace(/^\//, "");
		const lower = normalized.toLowerCase();
		const basename = lower.split("/").pop() ?? lower;

		if (basename === "package.json") return true;
		if (basename === "package-lock.json") return true;
		if (basename === "tsconfig.json") return true;
		if (basename === ".gitignore") return true;
		if (lower.startsWith(".github/")) return true;
		if (lower.startsWith(".git/")) return true;
		if (lower.startsWith("node_modules/")) return true;
		if (lower.includes("/node_modules/")) return true;
		if (/(^|\/)quartz\.config\.[^/]+$/i.test(normalized)) return true;

		return false;
	}

	private setOperating(operating: boolean): void {
		this.isOperating = operating;
		this.updateOperationButtons();
	}

	private updateOperationButtons(): void {
		const disabled = this.isOperating || !this.hasFullStatus;

		if (this.publishButtonEl) {
			this.publishButtonEl.disabled = disabled;
		}

		if (this.deleteButtonEl) {
			this.deleteButtonEl.disabled = disabled;
		}
	}

	private updateProgress(): void {
		if (!this.progressIndicatorEl) return;
		const { current, total } = this.progressState;
		const percent = total === 0 ? 0 : Math.round((current / total) * 100);
		this.progressIndicatorEl.style.width = `${percent}%`;
	}
}
