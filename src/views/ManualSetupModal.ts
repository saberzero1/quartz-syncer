import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { GitAuthType } from "src/models/settings";
import { createGitBackend } from "src/git/GitBackendFactory";
import { detectGitProvider } from "src/utils/gitProviderDetection";

export class ManualSetupModal extends Modal {
	private remoteUrl = "";
	private branch = "v5";
	private authType: GitAuthType = "basic";
	private username = "";
	private token = "";
	private corsProxyUrl = "";
	private contentFolder = "content";
	private testStatusEl: HTMLElement | null = null;
	private isTesting = false;

	constructor(
		app: App,
		private plugin: QuartzSyncer,
	) {
		super(app);
	}

	onOpen(): void {
		this.plugin
			.getEventSink()
			?.emit("ui.modal.opened", { name: "manual-setup" });
		this.remoteUrl = this.plugin.settings.gitRemoteUrl;
		this.branch = this.plugin.settings.gitBranch || "v5";
		this.authType = this.plugin.settings.gitAuthType || "basic";
		this.username = this.plugin.settings.gitAuthUsername || "";
		this.corsProxyUrl = this.plugin.settings.gitCorsProxyUrl || "";
		this.contentFolder = this.plugin.settings.contentFolder || "content";

		this.render();
	}

	onClose(): void {
		this.plugin
			.getEventSink()
			?.emit("ui.modal.closed", { name: "manual-setup" });
		this.contentEl.empty();
		this.testStatusEl = null;
	}

	private render(): void {
		this.contentEl.empty();
		this.testStatusEl = null;
		this.titleEl.setText("Manual setup");

		this.contentEl.createDiv({ cls: "qs-manual-setup-desc" }).createSpan({
			text: "Configure a direct Git connection to any Quartz repository.",
		});

		new Setting(this.contentEl)
			.setName("Remote URL")
			.setDesc(
				"Full git remote URL (e.g. https://github.com/user/quartz.git)",
			)
			.addText((text) => {
				text.setPlaceholder("https://github.com/user/quartz.git")
					.setValue(this.remoteUrl)
					.onChange((value) => {
						this.remoteUrl = value.trim();
					});
				text.inputEl.addEventListener("blur", () => {
					this.plugin.settings.gitProviderHint = detectGitProvider(
						this.remoteUrl,
					);
				});
				text.inputEl.addClass("qs-full-width-input");
			});

		new Setting(this.contentEl)
			.setName("Branch")
			.setDesc("Git branch to sync with")
			.addText((text) => {
				text.setPlaceholder("v5")
					.setValue(this.branch)
					.onChange((value) => {
						this.branch = value.trim() || "v5";
					});
			});

		new Setting(this.contentEl)
			.setName("Authentication type")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("basic", "Username & token/password")
					.addOption("bearer", "Token (bearer)")
					.addOption("none", "None")
					.setValue(this.authType)
					.onChange((value) => {
						this.authType = value as GitAuthType;
						this.render();
					});
			});

		if (this.authType === "basic") {
			new Setting(this.contentEl)
				.setName("Username")
				.setDesc("Your username for authentication")
				.addText((text) => {
					text.setPlaceholder("username")
						.setValue(this.username)
						.onChange((value) => {
							this.username = value.trim();
						});
				});
		}

		if (this.authType !== "none") {
			new Setting(this.contentEl)
				.setName("Access token")
				.setDesc("Personal access token or password")
				.addText((text) => {
					text.setPlaceholder(
						this.authType === "bearer"
							? "ghp_..."
							: "token or password",
					)
						.setValue(this.token)
						.onChange((value) => {
							this.token = value.trim();
						});
					text.inputEl.type = "password";
					text.inputEl.addClass("qs-full-width-input");
				});
		}

		new Setting(this.contentEl).setName("Advanced").setHeading();

		const advancedDetails = this.contentEl.createEl("details", {
			cls: "qs-manual-setup-advanced",
		});
		advancedDetails.createEl("summary", { text: "Advanced settings" });

		new Setting(advancedDetails)
			.setName("CORS proxy URL")
			.setDesc("Required for some browser environments")
			.addText((text) => {
				text.setPlaceholder("https://cors-proxy.example.com")
					.setValue(this.corsProxyUrl)
					.onChange((value) => {
						this.corsProxyUrl = value.trim();
					});
				text.inputEl.addClass("qs-full-width-input");
			});

		new Setting(advancedDetails)
			.setName("Content folder")
			.setDesc("Quartz content folder in the repository")
			.addText((text) => {
				text.setPlaceholder("content")
					.setValue(this.contentFolder)
					.onChange((value) => {
						this.contentFolder = value.trim() || "content";
					});
			});

		const testSetting = new Setting(this.contentEl)
			.setName("Connection test")
			.setDesc("Verify your settings before saving.");

		testSetting.addButton((button) => {
			button.setButtonText("Test connection").onClick(async () => {
				await this.runConnectionTest(button.buttonEl);
			});
		});

		this.testStatusEl = testSetting.controlEl.createSpan({
			text: "",
		});

		new Setting(this.contentEl).addButton((button) => {
			button
				.setCta()
				.setButtonText("Save")
				.onClick(() => {
					void this.save();
				});
		});
	}

	private async runConnectionTest(
		buttonEl: HTMLButtonElement,
	): Promise<void> {
		if (!this.remoteUrl) {
			this.updateTestStatus("Set a remote URL first.");
			return;
		}

		if (this.isTesting) return;
		this.isTesting = true;
		buttonEl.disabled = true;
		this.updateTestStatus("Testing…");

		try {
			const backend = createGitBackend(
				{
					remoteUrl: this.remoteUrl,
					branch: this.branch || "v5",
					corsProxyUrl: this.corsProxyUrl || undefined,
					auth: {
						type: this.authType,
						username: this.username || undefined,
						secret:
							this.token ||
							this.plugin.secretStorageService.getToken() ||
							undefined,
					},
				},
				this.app,
			);

			const result = await backend.testConnection();

			if (!result.ok) {
				this.updateTestStatus(result.error ?? "Connection failed.");
				return;
			}

			const writeStatus = result.writeAccess ? "write" : "read-only";
			this.updateTestStatus(`Connected (${writeStatus}).`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.updateTestStatus(`Connection failed: ${message}`);
		} finally {
			buttonEl.disabled = false;
			this.isTesting = false;
		}
	}

	private updateTestStatus(text: string): void {
		if (!this.testStatusEl) return;
		this.testStatusEl.setText(text);
	}

	private async save(): Promise<void> {
		if (!this.remoteUrl) {
			new Notice("Remote URL is required.");
			return;
		}

		try {
			const parsed = new URL(this.remoteUrl);
			if (!["http:", "https:"].includes(parsed.protocol)) {
				new Notice(
					"Only HTTP and HTTPS URLs are supported. SSH URLs are not compatible.",
				);
				return;
			}
		} catch {
			new Notice(
				"Enter a valid remote URL (e.g. https://github.com/user/quartz.git).",
			);
			return;
		}

		if (
			this.authType !== "none" &&
			!this.token &&
			!this.plugin.secretStorageService.getToken()
		) {
			new Notice(
				`Access token is required for ${this.authType} authentication.`,
			);
			return;
		}

		this.plugin.settings.gitRemoteUrl = this.remoteUrl;
		this.plugin.settings.gitBranch = this.branch;
		this.plugin.settings.gitAuthType = this.authType;
		this.plugin.settings.gitAuthUsername = this.username;
		this.plugin.settings.gitProviderHint = detectGitProvider(
			this.remoteUrl,
		);
		this.plugin.settings.gitCorsProxyUrl = this.corsProxyUrl;
		this.plugin.settings.contentFolder = this.contentFolder;

		if (this.authType !== "none" && this.token) {
			this.plugin.secretStorageService.setToken(this.token);
		}

		await this.plugin.saveSettings();
		new Notice("Repository settings saved.");
		this.close();
	}
}
