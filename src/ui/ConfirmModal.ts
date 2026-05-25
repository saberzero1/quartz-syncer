import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
	private resolved = false;
	private resolve: (value: boolean) => void = () => {};

	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmLabel = "Confirm",
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);

		this.contentEl.createEl("p", { text: this.message });

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(this.confirmLabel)
					.setDestructive()
					.onClick(() => {
						this.resolved = true;
						this.resolve(true);
						this.close();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			);
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolve(false);
		}
	}

	await(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}
