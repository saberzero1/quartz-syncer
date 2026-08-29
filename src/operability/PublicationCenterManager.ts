import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import {
	PublicationCenter,
	type PublicationCenterController,
} from "src/views/PublicationCenter/PublicationCenter";

export class PublicationCenterManager {
	private modal: PublicationCenter | null = null;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
	) {}

	open(): PublicationCenterController {
		if (this.modal) {
			return this.modal.getController();
		}

		this.modal = new PublicationCenter(this.app, this.plugin);
		const originalOnClose = this.modal.onClose.bind(this.modal);
		this.modal.onClose = () => {
			originalOnClose();
			this.modal = null;
		};
		this.modal.open();
		return this.modal.getController();
	}

	getController(): PublicationCenterController | null {
		return this.modal?.getController() ?? null;
	}

	isOpen(): boolean {
		return this.modal !== null;
	}

	close(): void {
		this.modal?.close();
		this.modal = null;
	}
}
