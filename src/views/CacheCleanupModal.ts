import { Modal, Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";

/**
 * Require informed consent to cross vault boundaries: show the exact database
 * names and retain that reviewed list rather than surveying again on confirmation.
 */
export class CacheCleanupModal extends Modal {
	private isRunning = false;
	private openGeneration = 0;

	constructor(private plugin: QuartzSyncer) {
		super(plugin.app);
	}

	onOpen(): void {
		this.plugin.getEventSink()?.emit("ui.modal.opened", {
			name: "cache-cleanup",
		});
		this.modalEl.setAttrs(qsDom("cache-cleanup"));
		this.titleEl.setText("Clean up caches from other vaults");
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: "Looking for cached databases…" });
		void this.loadSurvey(++this.openGeneration);
	}

	private async loadSurvey(generation: number): Promise<void> {
		try {
			const { names } = await this.plugin.cacheMaintenance.survey();
			if (generation !== this.openGeneration) return;
			this.contentEl.empty();
			if (names.length === 0) {
				this.contentEl
					.createEl("p", { text: "There are no caches to clean up." })
					.setAttrs(qsDom("cache-cleanup-empty"));
				this.addCloseButton(this.contentEl, "Close");
				return;
			}

			this.contentEl.createEl("p", {
				text: "These caches belong to other vaults or to remotes you no longer publish to. Any vault still in use will rebuild its cache automatically next time it is opened. No notes are affected — only cached data is deleted.",
			});
			const list = this.contentEl.createEl("ul", {
				cls: "qs-cache-cleanup-list",
			});
			for (const name of names) {
				list.createEl("li", { text: name }).setAttrs(
					qsDom("cache-cleanup-item", { name }),
				);
			}
			const buttons = this.contentEl.createDiv({
				cls: "qs-cache-cleanup-buttons",
			});
			const cancel = this.addCloseButton(buttons, "Cancel");
			const confirm = buttons.createEl("button", {
				text: `Delete ${names.length} ${names.length === 1 ? "database" : "databases"}`,
				cls: "mod-warning",
			});
			confirm.setAttrs(qsDom("cache-cleanup-confirm"));
			confirm.addEventListener("click", () => {
				void this.confirmCleanup(names, cancel, confirm);
			});
		} catch (error) {
			if (generation !== this.openGeneration) return;
			console.debug("Failed to survey caches:", error);
			this.contentEl.empty();
			this.contentEl.createEl("p", {
				text: "Could not list cached databases. No caches were deleted.",
			});
			this.addCloseButton(this.contentEl, "Close");
		}
	}

	private addCloseButton(
		parent: HTMLElement,
		text: string,
	): HTMLButtonElement {
		const button = parent.createEl("button", { text });
		button.setAttrs(qsDom("cache-cleanup-cancel"));
		button.addEventListener("click", () => {
			if (!this.isRunning) this.close();
		});
		return button;
	}

	private async confirmCleanup(
		names: readonly string[],
		cancel: HTMLButtonElement,
		confirm: HTMLButtonElement,
	): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		cancel.disabled = true;
		confirm.disabled = true;
		try {
			const { dropped, failed } =
				await this.plugin.cacheMaintenance.drop(names);
			this.close();
			new Notice(
				`Reclaimed ${dropped.length} cached ${dropped.length === 1 ? "database" : "databases"}.` +
					(failed.length > 0
						? ` Failed to delete ${failed.length}.`
						: ""),
			);
		} catch (error) {
			console.debug("Failed to clean up caches:", error);
			this.close();
			new Notice(
				"Cache cleanup failed. Some caches may not have been deleted.",
			);
		} finally {
			this.isRunning = false;
		}
	}

	onClose(): void {
		// Ignore a survey finishing after close, including a previous open of this modal.
		this.openGeneration++;
		this.plugin.getEventSink()?.emit("ui.modal.closed", {
			name: "cache-cleanup",
		});
		this.contentEl.empty();
	}
}
