import { App, Setting } from "obsidian";
import type QuartzSyncer from "src/main";
import type { GitAuthType, GitProviderHint } from "src/models/settings";
import { createGitBackend } from "src/git/GitBackendFactory";
import { SettingPageBase } from "./SettingPageBase";

export class GitSettingsPage extends SettingPageBase {
	private app: App;
	private plugin: QuartzSyncer;
	private statusEl: HTMLElement | null = null;

	constructor(app: App, plugin: QuartzSyncer) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.title = "Git";
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Git repository")
			.setDesc(
				"Configure your git remote, branch, and authentication.",
			)
			.setHeading();

		this.renderRemoteUrl();
		this.renderBranch();
		this.renderProviderHint();
		this.renderAuthType();
		this.renderUsername();
		this.renderToken();
		this.renderCorsProxy();
		this.renderConnectionTest();
	}

	private get settings() {
		return this.plugin.settings;
	}

	private async saveSettings(): Promise<void> {
		await this.plugin.saveSettings();
	}

	private renderRemoteUrl(): void {
		new Setting(this.containerEl)
			.setName("Remote URL")
			.setDesc(
				"The full URL of your git repository (e.g., HTTPS://GitHub.com/username/Quartz.git)",
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"https://github.com/username/quartz.git",
					)
					.setValue(this.settings.gitRemoteUrl)
					.onChange(async (value) => {
						this.settings.gitRemoteUrl = value;
						this.autoDetectProvider(value);
						await this.saveSettings();
					}),
			);
	}

	private renderBranch(): void {
		new Setting(this.containerEl)
			.setName("Branch")
			.setDesc("The branch to sync with")
			.addText((text) =>
				text
					.setPlaceholder("V4")
					.setValue(this.settings.gitBranch)
					.onChange(async (value) => {
						this.settings.gitBranch = value || "v4";
						await this.saveSettings();
					}),
			);
	}

	private renderProviderHint(): void {
		new Setting(this.containerEl)
			.setName("Provider")
			.setDesc(
				"Select your git provider for optimized authentication hints",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("github", "GitHub")
					.addOption("gitlab", "GitLab")
					.addOption("bitbucket", "Bitbucket")
					.addOption("gitea", "Gitea / Codeberg")
					.addOption("custom", "Custom / self-hosted")
					.setValue(this.settings.gitProviderHint || "github")
					.onChange(async (value) => {
						this.settings.gitProviderHint =
							value as GitProviderHint;
						await this.saveSettings();
						this.display();
					}),
			);
	}

	private renderAuthType(): void {
		new Setting(this.containerEl)
			.setName("Authentication type")
			.setDesc("How to authenticate with the git server")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("basic", "Username & token/password")
					.addOption("bearer", "Bearer token")
					.addOption("none", "None (public repos)")
					.setValue(this.settings.gitAuthType)
					.onChange(async (value) => {
						this.settings.gitAuthType = value as GitAuthType;
						await this.saveSettings();
						this.display();
					}),
			);
	}

	private renderUsername(): void {
		if (this.settings.gitAuthType !== "basic") {
			return;
		}

		const providerHint = this.settings.gitProviderHint;
		let placeholder = "username";
		let description = "Your username for authentication";

		if (providerHint === "gitlab") {
			placeholder = "oauth2 or username";

			description =
				"Use 'oauth2' for personal access tokens, or your username";
		} else if (providerHint === "bitbucket") {
			placeholder = "x-token-auth or username";

			description =
				"Use 'x-token-auth' for app passwords, or your username";
		}

		new Setting(this.containerEl)
			.setName("Username")
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.settings.gitAuthUsername || "")
					.onChange(async (value) => {
						this.settings.gitAuthUsername = value;
						await this.saveSettings();
					}),
			);
	}

	private renderToken(): void {
		if (this.settings.gitAuthType === "none") {
			return;
		}

		const providerHint = this.settings.gitProviderHint;
		let name = "Access token";
		let description = "Your personal access token or password";

		if (providerHint === "github") {
			description =
				"A GitHub Personal Access Token (classic or fine-grained) with 'Contents' permission";
		} else if (providerHint === "gitlab") {
			description =
				"A GitLab Personal Access Token with 'read_repository' and 'write_repository' scopes";
		} else if (providerHint === "bitbucket") {
			name = "App password";
			description = "A Bitbucket App Password with repository write access";
		}

		const desc = createFragment();
		desc.createSpan({ text: description + ". " });

		desc.createEl("a", {
			text: "Documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Settings/Git/Access-Token",
		});

		const hasToken = this.plugin.secretStorageService.hasToken();

		const setting = new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc);

		const controlEl = setting.controlEl;
		const tokenRow = controlEl.createDiv({
			cls: "quartz-syncer-token-row",
		});

		const statusEl = tokenRow.createSpan({
			cls: hasToken
				? "quartz-syncer-token-status-set"
				: "quartz-syncer-token-status-unset",
		});
		statusEl.setText(
			hasToken ? "Token stored securely" : "No token set",
		);

		const input = tokenRow.createEl("input", {
			type: "password",
			cls: "quartz-syncer-token-input",
			placeholder: hasToken
				? "Enter new token to replace"
				: "Enter token",
		});

		const saveBtn = tokenRow.createEl("button", {
			cls: "mod-cta",
			text: hasToken ? "Update" : "Save",
		});

		const updateStatus = (stored: boolean) => {
			statusEl.setText(stored ? "Token stored securely" : "No token set");
			statusEl.toggleClass("quartz-syncer-token-status-set", stored);
			statusEl.toggleClass("quartz-syncer-token-status-unset", !stored);
			saveBtn.setText(stored ? "Update" : "Save");
			input.placeholder = stored
				? "Enter new token to replace"
				: "Enter token";
		};

		saveBtn.addEventListener("click", () => {
			const value = input.value.trim();
			if (!value) return;
			this.plugin.secretStorageService.setToken(value);
			input.value = "";
			updateStatus(true);
			void this.saveSettings();
		});

		if (hasToken) {
			const clearBtn = tokenRow.createEl("button", {
				cls: "mod-warning",
				text: "Clear",
			});

			clearBtn.addEventListener("click", () => {
				this.plugin.secretStorageService.clearToken();
				updateStatus(false);
				clearBtn.remove();
				void this.saveSettings();
			});
		}
	}

	private renderCorsProxy(): void {
		const desc = createFragment();

		desc.createSpan({
			text: "A CORS proxy URL for browser environments. Required on mobile/web if your Git server doesn't support CORS. ",
		});

		desc.createEl("a", {
			text: "Learn more",
			href: "https://github.com/isomorphic-git/cors-proxy",
		});

		new Setting(this.containerEl)
			.setName("CORS proxy (optional)")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("https://cors.isomorphic-git.org")
					.setValue(this.settings.gitCorsProxyUrl || "")
					.onChange(async (value) => {
						this.settings.gitCorsProxyUrl = value;
						await this.saveSettings();
					}),
			);
	}

	private renderConnectionTest(): void {
		const setting = new Setting(this.containerEl)
			.setName("Connection test")
			.setDesc(
				"Verify read/write access with the current settings.",
			);

		setting.addButton((button) => {
			button
				.setButtonText("Test connection")
				.setCta()
				.onClick(async () => {
					await this.runConnectionTest(button.buttonEl);
				});
		});

		this.statusEl = setting.controlEl.createSpan({
			cls: "quartz-syncer-git-test-status",
			text: "Not tested",
		});
	}

	private async runConnectionTest(buttonEl: HTMLButtonElement): Promise<void> {
		if (!this.settings.gitRemoteUrl) {
			this.updateStatus("Set a remote URL first.");
			return;
		}

		buttonEl.disabled = true;
		this.updateStatus("Testing...");

		try {
			const backend = createGitBackend(
				{
					remoteUrl: this.settings.gitRemoteUrl,
					branch: this.settings.gitBranch || "v4",
					corsProxyUrl: this.settings.gitCorsProxyUrl || undefined,
					auth: {
						type: this.settings.gitAuthType,
						username: this.settings.gitAuthUsername || undefined,
						secret:
							this.plugin.secretStorageService.getToken() ||
							undefined,
					},
				},
				this.app,
			);

			const result = await backend.testConnection();

			if (!result.ok) {
				this.updateStatus(result.error ?? "Connection failed.");
				return;
			}

			const writeStatus = result.writeAccess ? "write" : "read-only";
			this.updateStatus(`Connected (${writeStatus}).`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.updateStatus(`Connection failed: ${message}`);
		} finally {
			buttonEl.disabled = false;
		}
	}

	private updateStatus(text: string): void {
		if (!this.statusEl) return;
		this.statusEl.setText(text);
	}

	private autoDetectProvider(url: string): void {
		let hint: GitProviderHint = "custom";

		try {
			const hostname = new URL(url).hostname.toLowerCase();

			if (hostname === "github.com" || hostname.endsWith(".github.com")) {
				hint = "github";
			} else if (
				hostname === "gitlab.com" ||
				hostname.endsWith(".gitlab.com")
			) {
				hint = "gitlab";
			} else if (
				hostname === "bitbucket.org" ||
				hostname.endsWith(".bitbucket.org")
			) {
				hint = "bitbucket";
			} else if (hostname === "codeberg.org") {
				hint = "gitea";
			}
		} catch {
			hint = "custom";
		}

		this.settings.gitProviderHint = hint;
	}
}
