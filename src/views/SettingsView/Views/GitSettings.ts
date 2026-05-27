import {
	Setting,
	App,
	SettingPage,
	debounce,
	normalizePath,
	setIcon,
} from "obsidian";
import QuartzSyncer from "main";
import { FolderSuggest } from "src/ui/suggest/folder";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type { GitAuthType, GitProviderHint } from "src/models/settings";
import { SecretStorageService } from "src/utils/SecretStorageService";

export class GitSettingsPage extends SettingPage {
	private app: App;
	private plugin: QuartzSyncer;
	private readStatus: "loading" | "connected" | "error" = "loading";
	private writeStatus: "loading" | "connected" | "error" = "loading";
	private readStatusElement!: HTMLElement;
	private writeStatusElement!: HTMLElement;
	private remoteBranches: string[] = [];
	private defaultBranch: string | null = null;
	private branchSettingEl: HTMLElement | null = null;
	private branchesLoaded = false;
	private secretStorageService: SecretStorageService;

	constructor(app: App, plugin: QuartzSyncer) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.title = "Git";
		this.secretStorageService = new SecretStorageService(app);
	}

	display(): void {
		this.containerEl.empty();
		this.branchSettingEl = null;

		this.initializeGitHeader();
		this.initializeRemoteUrlSetting();
		this.initializeBranchSetting();
		this.initializeProviderHintSetting();
		this.initializeAuthTypeSetting();
		this.initializeUsernameSetting();
		this.initializeSecretSetting();
		this.initializeCorsProxySetting();
		this.initializeVaultFolderSetting();
	}

	hide(): void {
		this.debouncedUpdateConnectionStatus.cancel();
	}

	private get settings() {
		return this.plugin.settings;
	}

	private async saveSettings() {
		await this.plugin.saveSettings();
	}

	private initializeGitHeader() {
		const statusContainer = createDiv({
			cls: "quartz-syncer-git-status-container",
		});

		const readPill = statusContainer.createSpan({
			cls: "quartz-syncer-git-status-pill quartz-syncer-git-status-pending",
		});
		readPill.setText("Read: pending");
		this.readStatusElement = readPill;

		const writePill = statusContainer.createSpan({
			cls: "quartz-syncer-git-status-pill quartz-syncer-git-status-pending",
		});
		writePill.setText("Write: pending");
		this.writeStatusElement = writePill;

		void this.checkConnectionAndSaveSettings();

		new Setting(this.containerEl)
			.setName("Git repository")
			.setDesc(
				"Configure your Git remote. Works with GitHub, GitLab, Bitbucket, and self-hosted Git servers.",
			)
			.setHeading()
			.nameEl.append(statusContainer);
	}

	private checkConnectionAndSaveSettings = async () => {
		void this.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	private updateConnectionStatus = async () => {
		if (!this.settings.gitRemoteUrl) {
			this.readStatus = "error";
			this.writeStatus = "error";
			this.remoteBranches = [];
			this.defaultBranch = null;
			this.updateConnectionStatusIndicator();

			return;
		}

		const auth = {
			type: this.settings.gitAuthType,
			username: this.settings.gitAuthUsername || undefined,
			secret: this.secretStorageService.getToken() || undefined,
		};

		try {
			const { branches, defaultBranch } =
				await RepositoryConnection.fetchRemoteBranches(
					this.settings.gitRemoteUrl,
					auth,
					this.settings.gitCorsProxyUrl || undefined,
				);

			this.remoteBranches = branches;
			this.defaultBranch = defaultBranch;

			const hadBranches = this.branchesLoaded;

			if (branches.length > 0) {
				this.readStatus = "connected";
				this.branchesLoaded = true;

				if (!this.settings.gitBranch) {
					this.settings.gitBranch = defaultBranch || "v4";
					await this.saveSettings();
				}

				if (!hadBranches) {
					this.refreshBranchSetting();
				}
			} else {
				this.readStatus = "error";
			}
		} catch {
			this.readStatus = "error";
			this.remoteBranches = [];
			this.defaultBranch = null;
		}

		try {
			const canWrite = await RepositoryConnection.checkWriteAccess(
				this.settings.gitRemoteUrl,
				auth,
				this.settings.gitCorsProxyUrl || undefined,
			);
			this.writeStatus = canWrite ? "connected" : "error";
		} catch {
			this.writeStatus = "error";
		}

		this.updateConnectionStatusIndicator();
	};

	private refreshBranchSetting() {
		if (this.branchSettingEl) {
			this.branchSettingEl.empty();
			this.initializeBranchSetting();
		}
	}

	private debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	private updateConnectionStatusIndicator() {
		this.applyStatusToElement(
			this.readStatusElement,
			this.readStatus,
			"Read",
		);

		this.applyStatusToElement(
			this.writeStatusElement,
			this.writeStatus,
			"Write",
		);
	}

	private applyStatusToElement(
		el: HTMLElement,
		status: "loading" | "connected" | "error",
		label: string,
	) {
		el.removeClass(
			"quartz-syncer-git-status-pending",
			"quartz-syncer-git-status-success",
			"quartz-syncer-git-status-failed",
		);

		if (status === "loading") {
			el.setText(`${label}: pending`);
			el.addClass("quartz-syncer-git-status-pending");
		} else if (status === "connected") {
			el.setText(`${label}: connected`);
			el.addClass("quartz-syncer-git-status-success");
		} else {
			el.setText(`${label}: failed`);
			el.addClass("quartz-syncer-git-status-failed");
		}
	}

	private initializeRemoteUrlSetting() {
		new Setting(this.containerEl)
			.setName("Remote URL")
			.setDesc(
				"The full URL of your Git repository (e.g., https://github.com/username/quartz.git)",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://github.com/username/quartz.git")
					.setValue(this.settings.gitRemoteUrl)
					.onChange(async (value) => {
						this.settings.gitRemoteUrl = value;
						this.autoDetectProvider(value);
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private autoDetectProvider(url: string) {
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

	private initializeBranchSetting() {
		if (!this.branchSettingEl) {
			this.branchSettingEl = this.containerEl.createDiv();
		}

		const setting = new Setting(this.branchSettingEl)
			.setName("Branch")
			.setDesc("The branch to sync with");

		if (this.remoteBranches.length > 0) {
			setting.addDropdown((dropdown) => {
				for (const branch of this.remoteBranches) {
					const label =
						branch === this.defaultBranch
							? `${branch} (default)`
							: branch;
					dropdown.addOption(branch, label);
				}

				const currentBranch = this.settings.gitBranch;

				if (
					currentBranch &&
					this.remoteBranches.includes(currentBranch)
				) {
					dropdown.setValue(currentBranch);
				} else if (this.defaultBranch) {
					dropdown.setValue(this.defaultBranch);
					this.settings.gitBranch = this.defaultBranch;
				} else if (this.remoteBranches.includes("v4")) {
					dropdown.setValue("v4");
					this.settings.gitBranch = "v4";
				} else if (this.remoteBranches.length > 0) {
					dropdown.setValue(this.remoteBranches[0]);
					this.settings.gitBranch = this.remoteBranches[0];
				}

				dropdown.onChange(async (value) => {
					this.settings.gitBranch = value;
					await this.checkConnectionAndSaveSettings();
				});
			});
		} else if (this.settings.gitRemoteUrl && !this.branchesLoaded) {
			setting.addText((text) =>
				text
					.setPlaceholder("Loading branches...")
					.setValue(this.settings.gitBranch)
					.setDisabled(true),
			);
		} else {
			setting.addText((text) =>
				text
					.setPlaceholder("v4")
					.setValue(this.settings.gitBranch)
					.onChange(async (value) => {
						this.settings.gitBranch = value || "v4";
						await this.checkConnectionAndSaveSettings();
					}),
			);
		}
	}

	private initializeProviderHintSetting() {
		new Setting(this.containerEl)
			.setName("Provider")
			.setDesc(
				"Select your Git provider for optimized authentication hints",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("github", "GitHub")
					.addOption("gitlab", "GitLab")
					.addOption("bitbucket", "Bitbucket")
					.addOption("gitea", "Gitea / Codeberg")
					.addOption("custom", "Custom / Self-hosted")
					.setValue(this.settings.gitProviderHint || "github")
					.onChange(async (value) => {
						this.settings.gitProviderHint =
							value as GitProviderHint;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeAuthTypeSetting() {
		new Setting(this.containerEl)
			.setName("Authentication type")
			.setDesc("How to authenticate with the Git server")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("basic", "Username & Token/Password")
					.addOption("bearer", "Bearer Token")
					.addOption("none", "None (public repos)")
					.setValue(this.settings.gitAuthType)
					.onChange(async (value) => {
						this.settings.gitAuthType = value as GitAuthType;
						await this.checkConnectionAndSaveSettings();
						this.display();
					}),
			);
	}

	private initializeUsernameSetting() {
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
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeSecretSetting() {
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

			description =
				"A Bitbucket App Password with repository write access";
		}

		const desc = createFragment();
		desc.createSpan({ text: description + ". " });

		desc.createEl("a", {
			text: "Documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Settings/Git/Access-Token",
		});

		const hasToken = this.secretStorageService.hasToken();

		const setting = new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc);

		const controlEl = setting.controlEl;

		const tokenContainer = controlEl.createDiv({
			cls: "quartz-syncer-token-container",
		});

		const statusIndicator = tokenContainer.createSpan({
			cls: `quartz-syncer-token-status ${
				hasToken
					? "quartz-syncer-token-status-set"
					: "quartz-syncer-token-status-unset"
			}`,
		});

		statusIndicator.setText(
			hasToken ? "Token stored securely" : "No token set",
		);

		const inputContainer = tokenContainer.createDiv({
			cls: "quartz-syncer-token-input-container",
		});

		const input = inputContainer.createEl("input", {
			type: "password",
			cls: "quartz-syncer-token-input",
			placeholder: hasToken
				? "Enter new token to replace"
				: "Enter token",
		});

		const toggleBtn = inputContainer.createEl("button", {
			cls: "quartz-syncer-token-toggle clickable-icon",
			attr: { "aria-label": "Toggle token visibility" },
		});
		setIcon(toggleBtn, "eye");

		let isVisible = false;

		toggleBtn.addEventListener("click", (e) => {
			e.preventDefault();
			isVisible = !isVisible;
			input.type = isVisible ? "text" : "password";
			setIcon(toggleBtn, isVisible ? "eye-off" : "eye");
		});

		const buttonContainer = tokenContainer.createDiv({
			cls: "quartz-syncer-token-buttons",
		});

		const saveBtn = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: hasToken ? "Update" : "Save",
		});

		const handleSaveClick = async () => {
			const value = input.value.trim();

			if (value) {
				this.secretStorageService.setToken(value);
				input.value = "";
				input.placeholder = "Enter new token to replace";
				statusIndicator.setText("Token stored securely");
				statusIndicator.removeClass("quartz-syncer-token-status-unset");
				statusIndicator.addClass("quartz-syncer-token-status-set");
				saveBtn.setText("Update");
				await this.checkConnectionAndSaveSettings();
			}
		};

		saveBtn.addEventListener("click", () => {
			void handleSaveClick();
		});

		if (hasToken) {
			const clearBtn = buttonContainer.createEl("button", {
				cls: "mod-warning",
				text: "Clear",
			});

			const handleClearClick = async () => {
				this.secretStorageService.clearToken();
				input.value = "";
				input.placeholder = "Enter token";
				statusIndicator.setText("No token set");
				statusIndicator.removeClass("quartz-syncer-token-status-set");
				statusIndicator.addClass("quartz-syncer-token-status-unset");
				saveBtn.setText("Save");
				clearBtn.remove();
				await this.checkConnectionAndSaveSettings();
			};

			clearBtn.addEventListener("click", () => {
				void handleClearClick();
			});
		}
	}

	private initializeCorsProxySetting() {
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
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeVaultFolderSetting() {
		new Setting(this.containerEl)
			.setName("Vault root folder")
			.setDesc(
				'The folder in your Obsidian vault to sync. Use "/" for the entire vault.',
			)
			.addSearch((text) => {
				new FolderSuggest(this.app, text.inputEl);

				text.setPlaceholder("/")
					.setValue(this.settings.vaultPath)
					.onChange(async (value) => {
						value = normalizePath(value.trim());

						if (value === "/") {
							value = "";
						}

						this.settings.vaultPath = `${value}/`;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}
}
