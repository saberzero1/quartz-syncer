import {
	arrayBufferToBase64,
	FuzzySuggestModal,
	Modal,
	Notice,
	setIcon,
	TFile,
} from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishFile } from "src/publishFile/PublishFile";
import type {
	ArbitraryFileEntry,
	MediaEntry,
	PublishStatus,
} from "src/publisher/types";
import { isMediaFile, isTextMediaFile } from "src/utils/mediaTypes";
import { DiffModal } from "src/views/DiffView/DiffModal";
import {
	PublicationTree,
	renderCategoryControls,
} from "src/views/PublicationCenter/TreeRenderer";
import {
	SelectableCategory,
	TreeState,
} from "src/views/PublicationCenter/TreeState";

type ProgressState = {
	current: number;
	total: number;
};

const categoryLabels: Record<SelectableCategory, string> = {
	unpublished: "Unpublished",
	changed: "Changed",
	deleted: "Deleted",
	published: "Published",
	"media-linked": "Linked",
	"media-unlinked": "Unlinked",
	arbitrary: "Custom",
};

export class PublicationCenter extends Modal {
	private status: PublishStatus | null = null;
	private treeState = new TreeState();
	private progressState: ProgressState = { current: 0, total: 0 };
	private progressIndicatorEl: HTMLDivElement | null = null;
	private publishButtonEl: HTMLButtonElement | null = null;
	private deleteButtonEl: HTMLButtonElement | null = null;
	private treeContainerEl: HTMLDivElement | null = null;
	private publicationTree: PublicationTree | null = null;
	private categoryCountEls = new Map<SelectableCategory, HTMLSpanElement>();
	private searchInputEl: HTMLInputElement | null = null;
	private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private hasShell = false;
	private isOperating = false;
	private fileMap = new Map<string, PublishFile>();
	private mediaMap = new Map<string, MediaEntry>();
	private arbitraryMap = new Map<string, ArbitraryFileEntry>();

	constructor(
		app: App,
		private _plugin: QuartzSyncer,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("qs-pub-center");
		this.contentEl.empty();
		this.titleEl.setText("Publication center");
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
		this._plugin.resumeAutoPublish();
		this.publicationTree?.unmount();
		this.contentEl.empty();
		this.progressIndicatorEl = null;
		this.publishButtonEl = null;
		this.deleteButtonEl = null;
		this.treeContainerEl = null;
		this.searchInputEl = null;
		this.categoryCountEls.clear();
		this.publicationTree = null;
		this.mediaMap.clear();
		this.arbitraryMap.clear();
		if (this.filterDebounceTimer !== null) {
			clearTimeout(this.filterDebounceTimer);
			this.filterDebounceTimer = null;
		}
		this.hasShell = false;
	}

	private renderLoadingState(): void {
		const wrapper = this.contentEl.createDiv({ cls: "pub-center-loading" });
		const spinner = wrapper.createSpan({ cls: "pub-center-spinner" });
		setIcon(spinner, "loader-2");
		spinner.setAttribute("aria-label", "Loading");
		wrapper.createSpan({ text: "Loading publish status…" });
	}

	private async loadStatus(): Promise<void> {
		const publisher = this._plugin.getPublisher();
		if (!publisher) {
			this.status = null;
			this.progressState = { current: 0, total: 0 };
			this.renderShell(true);
			this.updateTreeState();
			return;
		}

		try {
			this.status = await publisher.getPublishStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to load publish status: ${message}`);
			this.status = null;
		}
		this.progressState = { current: 0, total: 0 };
		this.buildFileMap();
		this.renderShell(true);
		this.updateTreeState();
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
		this.categoryCountEls.clear();
		this.searchInputEl = null;
		this.treeContainerEl = null;

		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: "pub-center-header" });
		const pluginName = this._plugin.manifest.name ?? "Quartz Syncer";
		header.createSpan({
			text: `Select notes to publish or delete with ${pluginName}.`,
		});

		if (this._plugin.settings.allowArbitraryFilePublishing) {
			const addButton = header.createEl("button", {
				text: "Add file",
				cls: "mod-cta",
			});
			addButton.addEventListener("click", () => {
				this.openArbitraryFilePicker();
			});
		}

		const controls = this.contentEl.createDiv({
			cls: "pub-center-controls",
		});
		this.categoryCountEls.set(
			"unpublished",
			renderCategoryControls(controls, this.treeState, "unpublished", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"changed",
			renderCategoryControls(controls, this.treeState, "changed", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"deleted",
			renderCategoryControls(controls, this.treeState, "deleted", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"published",
			renderCategoryControls(controls, this.treeState, "published", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"media-linked",
			renderCategoryControls(controls, this.treeState, "media-linked", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"media-unlinked",
			renderCategoryControls(controls, this.treeState, "media-unlinked", {
				onStateChange: () => this.updateTreeState(),
			}),
		);
		this.categoryCountEls.set(
			"arbitrary",
			renderCategoryControls(controls, this.treeState, "arbitrary", {
				onStateChange: () => this.updateTreeState(),
			}),
		);

		this.searchInputEl = this.contentEl.createEl("input", {
			type: "text",
			cls: "tree-search-input",
			placeholder: "Filter by file name\u2026",
			value: this.treeState.filterText,
		});
		this.searchInputEl.setAttribute("aria-label", "Filter files");
		this.searchInputEl.addEventListener("input", () => {
			if (this.filterDebounceTimer !== null) {
				clearTimeout(this.filterDebounceTimer);
			}

			this.filterDebounceTimer = setTimeout(() => {
				this.treeState.filterText = this.searchInputEl?.value ?? "";
				this.updateTreeState();
				this.filterDebounceTimer = null;
			}, 200);
		});

		this.treeContainerEl = this.contentEl.createDiv({
			cls: "pub-center-tree",
		});

		if (this.status) {
			this.publicationTree = new PublicationTree(
				this.treeContainerEl,
				this.treeState,
				{
					onFileClick: (path) => this.openDiff(path),
					onStateChange: () => this.updateTreeState(),
				},
			);
			this.publicationTree.mount(this.status);
		} else {
			this.treeContainerEl.createSpan({
				text: "Configure your git repository in settings to get started.",
			});
		}

		const footer = this.contentEl.createDiv({ cls: "pub-center-footer" });
		const progress = footer.createDiv({ cls: "progress-bar" });
		this.progressIndicatorEl = progress.createDiv({
			cls: "progress-bar-indicator",
		});
		this.updateProgress();

		const actions = footer.createDiv({ cls: "pub-center-actions" });
		this.publishButtonEl = actions.createEl("button", {
			cls: "mod-cta",
			text: "Publish",
		});
		this.publishButtonEl.disabled = this.isOperating;
		this.publishButtonEl.addEventListener("click", () => {
			void this.handlePublish();
		});

		this.deleteButtonEl = actions.createEl("button", {
			cls: "mod-warning",
			text: "Delete",
		});
		this.deleteButtonEl.disabled = this.isOperating;
		this.deleteButtonEl.addEventListener("click", () => {
			void this.handleDelete();
		});
	}

	private updateTreeState(): void {
		this.publicationTree?.update();
		for (const [category, label] of this.categoryCountEls) {
			const count = this.treeState.getCategoryCount(category);
			label.setText(`${categoryLabels[category]} (${count})`);
		}
	}

	private async openDiff(path: string): Promise<void> {
		const publisher = this._plugin.getPublisher();

		if (!publisher) {
			new Notice(
				"Configure your git repository in settings to get started.",
			);
			return;
		}

		const category = this.treeState.getCategory(path);

		if (category === "published") {
			new Notice("No changes to display.");
			return;
		}

		if (category === "arbitrary") {
			new Notice("Diffs are not available for custom files.");
			return;
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
		} catch {
			new Notice("Failed to load file content for diff.");
			return;
		}

		if (!localContent && !remoteContent) {
			new Notice(
				"No content available for diff. Try refreshing publish status.",
			);
			return;
		}

		new DiffModal(this.app, {
			filePath: path,
			localContent,
			remoteContent,
			diffViewStyle: this._plugin.settings.diffViewStyle,
		}).open();
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
		const noteDeletions = selected.filter(
			(path) => this.treeState.getCategory(path) === "deleted",
		);
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
		if (this.publishButtonEl) {
			this.publishButtonEl.disabled = operating;
		}
		if (this.deleteButtonEl) {
			this.deleteButtonEl.disabled = operating;
		}
	}

	private updateProgress(): void {
		if (!this.progressIndicatorEl) return;
		const { current, total } = this.progressState;
		const percent = total === 0 ? 0 : Math.round((current / total) * 100);
		this.progressIndicatorEl.style.width = `${percent}%`;
	}
}
