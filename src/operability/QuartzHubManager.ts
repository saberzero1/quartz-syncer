import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import {
	QuartzHub,
	type QuartzHubController,
} from "src/views/QuartzHub/QuartzHub";

export class QuartzHubManager {
	private modal: QuartzHub | null = null;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
	) {}

	open(): QuartzHubController {
		if (this.modal) {
			return this.modal.getController();
		}

		this.modal = new QuartzHub(this.app, this.plugin);
		const originalOnClose = this.modal.onClose.bind(this.modal);
		this.modal.onClose = () => {
			originalOnClose();
			this.modal = null;
		};
		this.modal.open();
		return this.modal.getController();
	}

	getController(): QuartzHubController | null {
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
