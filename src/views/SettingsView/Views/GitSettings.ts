import {
	Setting,
	App,
	PluginSettingTab,
	debounce,
	normalizePath,
	setIcon,
} from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import { FolderSuggest } from "src/ui/suggest/folder";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { GitAuthType, GitProviderHint } from "src/models/settings";
import { SecretStorageService } from "src/utils/SecretStorageService";

export class GitSettings extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	readStatus: "loading" | "connected" | "error";
	writeStatus: "loading" | "connected" | "error";
	private settingsRootElement: HTMLElement;
	readStatusElement: HTMLElement;
	writeStatusElement: HTMLElement;
	private remoteBranches: string[] = [];
	private defaultBranch: string | null = null;
	private branchSettingEl: HTMLElement | null = null;
	private branchesLoaded: boolean = false;
	private secretStorageService: SecretStorageService;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		settings: SettingView,
		settingsRootElement: HTMLElement,
	) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("settings-tab-content");
		this.readStatus = "loading";
		this.writeStatus = "loading";
		this.secretStorageService = new SecretStorageService(app);

		this.readStatusElement = createEl("span", { text: "pending..." });
		this.writeStatusElement = createEl("span", { text: "pending..." });
	}

	display() {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");
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

		this.settings.settings.lastUsedSettingsTab = "git";
		this.settings.plugin.saveSettings();
	}

	initializeGitHeader = () => {
		this.readStatusElement = createEl("span", { text: "pending..." });
		this.writeStatusElement = createEl("span", { text: "pending..." });

		this.checkConnectionAndSaveSettings();

		const statusContainer = createEl("span");

		const readWrapper = statusContainer.createEl("span");
		readWrapper.appendText(" (read: ");
		readWrapper.append(this.readStatusElement);
		readWrapper.appendText(")");

		readWrapper.addClass(
			"quartz-syncer-connection-status",
			"quartz-syncer-connection-status-pending",
		);

		const writeWrapper = statusContainer.createEl("span");
		writeWrapper.appendText(" (write: ");
		writeWrapper.append(this.writeStatusElement);
		writeWrapper.appendText(")");

		writeWrapper.addClass(
			"quartz-syncer-connection-status",
			"quartz-syncer-connection-status-pending",
		);

		new Setting(this.settingsRootElement)
			.setName("Git Repository")
			.setDesc(
				"Configure your Git remote. Works with GitHub, GitLab, Bitbucket, and self-hosted Git servers.",
			)
			.setHeading()
			.nameEl.append(statusContainer);
	};

	checkConnectionAndSaveSettings = async () => {
		this.settings.plugin.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	updateConnectionStatus = async () => {
		const gitSettings = this.settings.settings.git;

		if (!gitSettings.remoteUrl) {
			this.readStatus = "error";
			this.writeStatus = "error";
			this.remoteBranches = [];
			this.defaultBranch = null;
			this.updateConnectionStatusIndicator();

			return;
		}

		const authWithSecret = {
			...gitSettings.auth,
			secret: this.secretStorageService.getToken() || undefined,
		};

		try {
			const { branches, defaultBranch } =
				await RepositoryConnection.fetchRemoteBranches(
					gitSettings.remoteUrl,
					authWithSecret,
					gitSettings.corsProxyUrl,
				);

			this.remoteBranches = branches;
			this.defaultBranch = defaultBranch;

			const hadBranches = this.branchesLoaded;

			if (branches.length > 0) {
				this.readStatus = "connected";
				this.branchesLoaded = true;

				if (!gitSettings.branch) {
					gitSettings.branch = defaultBranch || "v4";
					await this.settings.plugin.saveSettings();
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
				gitSettings.remoteUrl,
				authWithSecret,
				gitSettings.corsProxyUrl,
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

	debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	updateConnectionStatusIndicator = () => {
		this.applyStatusToElement(this.readStatusElement, this.readStatus);
		this.applyStatusToElement(this.writeStatusElement, this.writeStatus);
	};

	private applyStatusToElement(
		el: HTMLElement,
		status: "loading" | "connected" | "error",
	) {
		if (el.parentElement === null) {
			return;
		}

		if (status === "loading") {
			el.innerText = "pending...";

			el.parentElement.classList.remove(
				"quartz-syncer-connection-status-success",
				"quartz-syncer-connection-status-failed",
			);

			el.parentElement.classList.add(
				"quartz-syncer-connection-status-pending",
			);
		}

		if (status === "connected") {
			el.innerText = "ok";

			el.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-failed",
			);

			el.parentElement.classList.add(
				"quartz-syncer-connection-status-success",
			);
		}

		if (status === "error") {
			el.innerText = "failed";

			el.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-success",
			);

			el.parentElement.classList.add(
				"quartz-syncer-connection-status-failed",
			);
		}
	}

	private initializeRemoteUrlSetting() {
		new Setting(this.settingsRootElement)
			.setName("Remote URL")
			.setDesc(
				"The full URL of your Git repository (e.g., https://github.com/username/quartz.git)",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://github.com/username/quartz.git")
					.setValue(this.settings.settings.git.remoteUrl)
					.onChange(async (value) => {
						this.settings.settings.git.remoteUrl = value;
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

		this.settings.settings.git.providerHint = hint;
	}

	private initializeBranchSetting() {
		if (!this.branchSettingEl) {
			this.branchSettingEl = this.settingsRootElement.createDiv();
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

				const currentBranch = this.settings.settings.git.branch;

				if (
					currentBranch &&
					this.remoteBranches.includes(currentBranch)
				) {
					dropdown.setValue(currentBranch);
				} else if (this.defaultBranch) {
					dropdown.setValue(this.defaultBranch);
					this.settings.settings.git.branch = this.defaultBranch;
				} else if (this.remoteBranches.includes("v4")) {
					dropdown.setValue("v4");
					this.settings.settings.git.branch = "v4";
				} else if (this.remoteBranches.length > 0) {
					dropdown.setValue(this.remoteBranches[0]);
					this.settings.settings.git.branch = this.remoteBranches[0];
				}

				dropdown.onChange(async (value) => {
					this.settings.settings.git.branch = value;
					await this.checkConnectionAndSaveSettings();
				});
			});
		} else {
			setting.addText((text) =>
				text
					.setPlaceholder("v4")
					.setValue(this.settings.settings.git.branch)
					.onChange(async (value) => {
						this.settings.settings.git.branch = value || "v4";
						await this.checkConnectionAndSaveSettings();
					}),
			);
		}
	}

	private initializeProviderHintSetting() {
		new Setting(this.settingsRootElement)
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
					.setValue(
						this.settings.settings.git.providerHint || "github",
					)
					.onChange(async (value) => {
						this.settings.settings.git.providerHint =
							value as GitProviderHint;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeAuthTypeSetting() {
		new Setting(this.settingsRootElement)
			.setName("Authentication Type")
			.setDesc("How to authenticate with the Git server")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("basic", "Username & Token/Password")
					.addOption("bearer", "Bearer Token")
					.addOption("none", "None (public repos)")
					.setValue(this.settings.settings.git.auth.type)
					.onChange(async (value) => {
						this.settings.settings.git.auth.type =
							value as GitAuthType;
						await this.checkConnectionAndSaveSettings();
						this.display();
					}),
			);
	}

	private initializeUsernameSetting() {
		if (this.settings.settings.git.auth.type !== "basic") {
			return;
		}

		const providerHint = this.settings.settings.git.providerHint;
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

		new Setting(this.settingsRootElement)
			.setName("Username")
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.settings.settings.git.auth.username || "")
					.onChange(async (value) => {
						this.settings.settings.git.auth.username = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeSecretSetting() {
		if (this.settings.settings.git.auth.type === "none") {
			return;
		}

		const providerHint = this.settings.settings.git.providerHint;
		let name = "Access Token";
		let description = "Your personal access token or password";

		if (providerHint === "github") {
			description =
				"A GitHub Personal Access Token (classic or fine-grained) with 'Contents' permission";
		} else if (providerHint === "gitlab") {
			description =
				"A GitLab Personal Access Token with 'read_repository' and 'write_repository' scopes";
		} else if (providerHint === "bitbucket") {
			name = "App Password";

			description =
				"A Bitbucket App Password with repository write access";
		}

		const desc = document.createDocumentFragment();
		desc.createEl("span", { text: description + ". " });

		desc.createEl("a", {
			text: "Documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Settings/Git/Access-Token",
		});

		const hasToken = this.secretStorageService.hasToken();

		const setting = new Setting(this.settingsRootElement)
			.setName(name)
			.setDesc(desc);

		const controlEl = setting.controlEl;

		const tokenContainer = controlEl.createDiv({
			cls: "quartz-syncer-token-container",
		});

		const statusIndicator = tokenContainer.createSpan({
			cls: `quartz-syncer-token-status ${hasToken ? "quartz-syncer-token-status-set" : "quartz-syncer-token-status-unset"}`,
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

		saveBtn.addEventListener("click", async () => {
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
		});

		if (hasToken) {
			const clearBtn = buttonContainer.createEl("button", {
				cls: "mod-warning",
				text: "Clear",
			});

			clearBtn.addEventListener("click", async () => {
				this.secretStorageService.clearToken();
				input.value = "";
				input.placeholder = "Enter token";
				statusIndicator.setText("No token set");
				statusIndicator.removeClass("quartz-syncer-token-status-set");
				statusIndicator.addClass("quartz-syncer-token-status-unset");
				saveBtn.setText("Save");
				clearBtn.remove();
				await this.checkConnectionAndSaveSettings();
			});
		}
	}

	private initializeCorsProxySetting() {
		const desc = document.createDocumentFragment();

		desc.createEl("span", {
			text: "A CORS proxy URL for browser environments. Required on mobile/web if your Git server doesn't support CORS. ",
		});

		desc.createEl("a", {
			text: "Learn more",
			href: "https://github.com/isomorphic-git/cors-proxy",
		});

		new Setting(this.settingsRootElement)
			.setName("CORS Proxy (optional)")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("https://cors.isomorphic-git.org")
					.setValue(this.settings.settings.git.corsProxyUrl || "")
					.onChange(async (value) => {
						this.settings.settings.git.corsProxyUrl =
							value || undefined;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeVaultFolderSetting() {
		const app = this.settings.app;

		new Setting(this.settingsRootElement)
			.setName("Vault root folder")
			.setDesc(
				'The folder in your Obsidian vault to sync. Use "/" for the entire vault.',
			)
			.addSearch((text) => {
				new FolderSuggest(app, text.inputEl);

				text.setPlaceholder("/")
					.setValue(this.settings.settings.vaultPath)
					.onChange(async (value) => {
						value = normalizePath(value.trim());

						if (value === "/") {
							value = "";
						}

						this.settings.settings.vaultPath = `${value}/`;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}
}
