import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishStatus } from "src/publisher/types";
import { DiffModal } from "src/views/DiffView/DiffModal";
import {
	renderCategoryControls,
	renderPublicationTree,
} from "src/views/PublicationCenter/TreeRenderer";
import { TreeState } from "src/views/PublicationCenter/TreeState";

type ProgressState = {
	current: number;
	total: number;
};

export class PublicationCenter extends Modal {
	private status: PublishStatus | null = null;
	private treeState = new TreeState();
	private progressState: ProgressState = { current: 0, total: 0 };
	private progressIndicatorEl: HTMLDivElement | null = null;

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
		this.contentEl.empty();
		this.progressIndicatorEl = null;
	}

	private renderLoadingState(): void {
		const wrapper = this.contentEl.createDiv({ cls: "pub-center-loading" });
		wrapper.createSpan({ text: "Loading publish status..." });
	}

	private async loadStatus(): Promise<void> {
		const publisher = this._plugin.getPublisher();
		if (!publisher) {
			this.status = null;
			this.progressState = { current: 0, total: 0 };
			this.render();
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
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: "pub-center-header" });
		const pluginName = this._plugin.manifest.name ?? "Quartz Syncer";
		header.createSpan({
			text: `Select notes to publish or delete with ${pluginName}.`,
		});

		const controls = this.contentEl.createDiv({
			cls: "pub-center-controls",
		});
		renderCategoryControls(controls, this.treeState, "unpublished", {
			onStateChange: () => this.render(),
		});
		renderCategoryControls(controls, this.treeState, "changed", {
			onStateChange: () => this.render(),
		});
		renderCategoryControls(controls, this.treeState, "deleted", {
			onStateChange: () => this.render(),
		});

		const treeContainer = this.contentEl.createDiv({
			cls: "pub-center-tree",
		});

		if (this.status) {
			renderPublicationTree(treeContainer, this.treeState, this.status, {
				onFileClick: (path) => this.openDiff(path),
				onStateChange: () => this.render(),
			});
		} else {
			treeContainer.createSpan({
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
		const publishButton = actions.createEl("button", {
			cls: "mod-cta",
			text: "Publish",
		});
		publishButton.addEventListener("click", () => {
			void this.handlePublish();
		});

		const deleteButton = actions.createEl("button", {
			cls: "mod-warning",
			text: "Delete",
		});
		deleteButton.addEventListener("click", () => {
			void this.handleDelete();
		});
	}

	private openDiff(path: string): void {
		const localContent = `# ${path}\n\nLocal content preview.`;
		const remoteContent = `# ${path}\n\nRemote content preview.`;
		new DiffModal(this.app, {
			filePath: path,
			localContent,
			remoteContent,
		}).open();
	}

	private async handlePublish(): Promise<void> {
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

		if (publishable.length === 0) {
			new Notice("No files selected for publishing.");
			return;
		}

		this.progressState = {
			current: publishable.length,
			total: publishable.length,
		};
		this.updateProgress();

		const publishPaths = new Set(publishable);
		const publishFiles = [
			...this.status.unpublished,
			...this.status.changed,
		].filter((file) => publishPaths.has(file.getVaultPath()));

		try {
			const result = await publisher.publishBatch(
				publishFiles,
				"Published via Quartz Syncer",
			);
			if (!result.success) {
				new Notice(`Publish failed: ${result.error ?? "Unknown error"}`);
				return;
			}
			new Notice(`Published ${result.filesPublished} file(s).`);
			await this.loadStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Publish failed: ${message}`);
		}
	}

	private async handleDelete(): Promise<void> {
		const publisher = this._plugin.getPublisher();
		if (!publisher || !this.status) {
			new Notice(
				"Configure your git repository in settings to get started.",
			);
			return;
		}

		const selected = this.treeState.getSelectedFiles();
		const deletable = selected.filter(
			(path) => this.treeState.getCategory(path) === "deleted",
		);

		if (deletable.length === 0) {
			new Notice("No files selected for deletion.");
			return;
		}

		this.progressState = {
			current: deletable.length,
			total: deletable.length,
		};
		this.updateProgress();

		try {
			const result = await publisher.deleteBatch(
				deletable,
				"Deleted via Quartz Syncer",
			);
			if (!result.success) {
				new Notice(`Delete failed: ${result.error ?? "Unknown error"}`);
				return;
			}
			new Notice(`Deleted ${result.filesDeleted} file(s).`);
			await this.loadStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Delete failed: ${message}`);
		}
	}

	private updateProgress(): void {
		if (!this.progressIndicatorEl) return;
		const { current, total } = this.progressState;
		const percent = total === 0 ? 0 : Math.round((current / total) * 100);
		this.progressIndicatorEl.style.width = `${percent}%`;
	}

}
