import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishStatus } from "src/publisher/types";
import type { PublishFile } from "src/publishFile/PublishFile";
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
		this.status = await this.getMockPublishStatus();
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
				text: "No publish status available yet.",
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
			this.handlePublish();
		});

		const deleteButton = actions.createEl("button", {
			cls: "mod-warning",
			text: "Delete",
		});
		deleteButton.addEventListener("click", () => {
			this.handleDelete();
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

	private handlePublish(): void {
		const selected = this.treeState.getSelectedFiles();
		const publishable = selected.filter((path) => {
			const category = this.treeState.getCategory(path);
			return category === "unpublished" || category === "changed";
		});

		if (publishable.length === 0) {
			new Notice("No files selected for publishing.");
			return;
		}

		this.progressState = { current: publishable.length, total: publishable.length };
		this.updateProgress();
		console.debug("Publish selection", publishable);
	}

	private handleDelete(): void {
		const selected = this.treeState.getSelectedFiles();
		const deletable = selected.filter(
			(path) => this.treeState.getCategory(path) === "deleted",
		);

		if (deletable.length === 0) {
			new Notice("No files selected for deletion.");
			return;
		}

		this.progressState = { current: deletable.length, total: deletable.length };
		this.updateProgress();
		console.debug("Delete selection", deletable);
	}

	private updateProgress(): void {
		if (!this.progressIndicatorEl) return;
		const { current, total } = this.progressState;
		const percent = total === 0 ? 0 : Math.round((current / total) * 100);
		this.progressIndicatorEl.style.width = `${percent}%`;
	}

	private async getMockPublishStatus(): Promise<PublishStatus> {
		const unpublished = [
			this.createMockPublishFile("notes/Welcome.md"),
			this.createMockPublishFile("notes/projects/Quartz Syncer.md"),
		];
		const changed = [
			this.createMockPublishFile("notes/updates/Release Notes.md"),
		];
		const published = [
			this.createMockPublishFile("notes/archive/Old Post.md"),
		];
		const deleted = ["notes/trash/Removed Note.md"];

		return {
			unpublished,
			changed,
			published,
			deleted,
		};
	}

	private createMockPublishFile(path: string): PublishFile {
		const mock = {
			getPath: () => path,
			getVaultPath: () => path,
		} satisfies Pick<PublishFile, "getPath" | "getVaultPath">;

		return mock as PublishFile;
	}
}
