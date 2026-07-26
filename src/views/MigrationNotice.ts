import { App, Modal, Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import {
	detectOldDatabases,
	cleanupOldDatabases,
} from "src/utils/LightningFsCleanup";

export class MigrationNotice extends Modal {
	private plugin: QuartzSyncer;

	constructor(app: App, plugin: QuartzSyncer) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Welcome to Quartz Syncer v2" });

		contentEl.createEl("p", {
			text: "Quartz Syncer has been rebuilt from the ground up for better performance, reliability, and new features.",
		});

		const features = contentEl.createEl("ul");
		features.createEl("li", {
			text: "Background precompilation — publish instantly",
		});
		features.createEl("li", {
			text: "Zero-config onboarding wizard for GitHub",
		});
		features.createEl("li", {
			text: "Encrypted token storage on desktop",
		});
		features.createEl("li", {
			text: "Diff viewer with split and unified modes",
		});

		const oldDbs = await detectOldDatabases();
		if (oldDbs.length > 0) {
			contentEl.createEl("h3", { text: "Clean up old data" });
			contentEl.createEl("p", {
				text: `Found ${oldDbs.length} old cache database(s) from v1 that can be safely removed to free up storage.`,
			});

			const cleanupBtn = contentEl.createEl("button", {
				text: "Clean up old cache data",
			});
			cleanupBtn.addEventListener("click", () => {
				void cleanupOldDatabases().then((count) => {
					new Notice(
						`Quartz Syncer: Cleaned up ${count} old database(s).`,
					);
					cleanupBtn.setText("Done");
					cleanupBtn.disabled = true;
				});
			});
		}

		const linksEl = contentEl.createEl("p");
		linksEl.createEl("a", {
			text: "View release notes",
			href: "https://github.com/saberzero1/quartz-syncer/releases",
		});

		const closeBtn = contentEl.createEl("button", {
			text: "Close",
			cls: "qs-migration-close-btn",
		});
		closeBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function shouldShowMigrationNotice(
	previousVersion: string,
	currentVersion: string,
): boolean {
	if (!previousVersion) return false;
	return previousVersion.startsWith("1.") && currentVersion.startsWith("2.");
}
