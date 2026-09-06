import { App, Modal } from "obsidian";

export class MigrationNotice extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("qs-migration-notice");
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText("Welcome to Quartz Syncer v2");

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

		contentEl.createEl("h3", { text: "Quartz v4 support" });
		contentEl.createEl("p", {
			text: "Publishing notes and media to Quartz v4 is supported and continues to work.",
		});
		contentEl.createEl("p", {
			text: "Quartz site management (config editing, plugin management, upgrades) requires Quartz v5.",
		});

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
