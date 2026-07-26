import { App, Modal } from "obsidian";
import type QuartzSyncer from "src/main";
import { GitHubApiService } from "src/github/GitHubApiService";
import type {
	GitHubPagesConfig,
	GitHubRepo,
	GitHubUser,
} from "src/github/types";

type WizardStep =
	| "token"
	| "flow"
	| "create"
	| "connect"
	| "configure"
	| "success";

export class OnboardingWizard extends Modal {
	private plugin: QuartzSyncer;
	private step: WizardStep = "token";
	private token = "";
	private user: GitHubUser | null = null;
	private repos: GitHubRepo[] = [];
	private selectedRepo: GitHubRepo | null = null;
	private createdRepo: GitHubRepo | null = null;
	private pagesConfig: GitHubPagesConfig | null = null;
	private errorMessage = "";
	private isBusy = false;
	private apiService: GitHubApiService | null = null;
	private newSiteName = "";

	constructor(app: App, plugin: QuartzSyncer) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("quartz-syncer-onboarding-wizard");
		this.titleEl.setText("Quartz Syncer setup wizard");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		this.renderNav();

		switch (this.step) {
			case "token":
				this.renderTokenStep();
				break;
			case "flow":
				this.renderFlowStep();
				break;
			case "create":
				this.renderCreateStep();
				break;
			case "connect":
				this.renderConnectStep();
				break;
			case "configure":
				this.renderConfigureStep();
				break;
			case "success":
				this.renderSuccessStep();
				break;
		}
	}

	private renderNav(): void {
		const navEl = this.contentEl.createDiv("qs-onboarding-nav");
		if (this.canGoBack()) {
			const backBtn = navEl.createEl("button", {
				text: "Back",
				cls: "qs-onboarding-back",
			});
			backBtn.addEventListener("click", () => this.goBack());
		}
	}

	private renderTokenStep(): void {
		this.contentEl.createEl("p", {
			text: "Enter your GitHub token to continue.",
		});

		const inputEl = this.contentEl.createEl("input", {
			type: "password",
			placeholder: "GitHub personal access token",
			cls: "qs-onboarding-token-input",
		});
		inputEl.value = this.token;
		inputEl.addEventListener("input", () => {
			this.token = inputEl.value.trim();
		});

		const validateBtn = this.contentEl.createEl("button", {
			text: this.isBusy ? "Validating..." : "Validate",
			cls: "qs-onboarding-validate",
		});
		validateBtn.disabled = this.isBusy;
		validateBtn.addEventListener("click", () => {
			void this.handleValidateToken();
		});

		this.renderError();
	}

	private renderFlowStep(): void {
		if (this.user) {
			this.contentEl.createEl("p", {
				text: `Signed in as ${this.user.name ?? this.user.login}.`,
			});
		}

		const createBtn = this.contentEl.createEl("button", {
			text: "Create new Quartz site",
			cls: "qs-onboarding-create",
		});
		createBtn.addEventListener("click", () => {
			this.step = "create";
			this.errorMessage = "";
			this.render();
		});

		const connectBtn = this.contentEl.createEl("button", {
			text: "Connect to existing repository",
			cls: "qs-onboarding-connect",
		});
		connectBtn.addEventListener("click", () => {
			void this.handleLoadRepos();
		});

		this.renderError();
	}

	private renderCreateStep(): void {
		this.contentEl.createEl("p", {
			text: "Choose a name for your Quartz site.",
		});

		const inputEl = this.contentEl.createEl("input", {
			type: "text",
			placeholder: "my-quartz-site",
			cls: "qs-onboarding-site-name",
		});
		inputEl.value = this.newSiteName;
		inputEl.addEventListener("input", () => {
			this.newSiteName = inputEl.value.trim();
		});

		const createBtn = this.contentEl.createEl("button", {
			text: this.isBusy ? "Creating..." : "Create site",
			cls: "qs-onboarding-create-confirm",
		});
		createBtn.disabled = this.isBusy;
		createBtn.addEventListener("click", () => {
			void this.handleCreateSite();
		});

		if (this.isBusy) {
			this.contentEl.createEl("p", {
				text: "Creating repository and enabling pages...",
				cls: "qs-onboarding-progress",
			});
		}

		this.renderError();
	}

	private renderConnectStep(): void {
		this.contentEl.createEl("p", {
			text: "Select a repository to connect.",
		});

		if (this.isBusy && this.repos.length === 0) {
			this.contentEl.createEl("p", {
				text: "Loading repositories...",
				cls: "qs-onboarding-progress",
			});
			return;
		}

		const selectEl = this.contentEl.createEl("select", {
			cls: "qs-onboarding-repo-select",
		});

		for (const repo of this.repos) {
			selectEl.createEl("option", {
				text: repo.full_name,
				value: repo.full_name,
			});
		}

		selectEl.value = this.selectedRepo?.full_name ?? "";
		selectEl.addEventListener("change", () => {
			const selected = this.repos.find(
				(repo) => repo.full_name === selectEl.value,
			);
			this.selectedRepo = selected ?? null;
		});

		const connectBtn = this.contentEl.createEl("button", {
			text: "Continue",
			cls: "qs-onboarding-connect-confirm",
		});
		connectBtn.addEventListener("click", () => {
			if (!this.selectedRepo) {
				this.errorMessage = "Select a repository to continue.";
				this.render();
				return;
			}
			this.step = "configure";
			this.errorMessage = "";
			this.render();
		});

		this.renderError();
	}

	private renderConfigureStep(): void {
		const repo = this.createdRepo ?? this.selectedRepo;
		if (!repo) {
			this.contentEl.createEl("p", {
				text: "No repository selected.",
			});
			return;
		}

		this.contentEl.createEl("p", {
			text: "We will configure Quartz Syncer with the following settings:",
		});

		this.contentEl.createEl("p", {
			text: `Repository: ${repo.full_name}`,
		});
		this.contentEl.createEl("p", {
			text: `Branch: ${repo.default_branch || "v4"}`,
		});

		const configureBtn = this.contentEl.createEl("button", {
			text: this.isBusy ? "Saving..." : "Save settings",
			cls: "qs-onboarding-configure",
		});
		configureBtn.disabled = this.isBusy;
		configureBtn.addEventListener("click", () => {
			void this.handleConfigure(repo);
		});

		this.renderError();
	}

	private renderSuccessStep(): void {
		this.contentEl.createEl("p", {
			text: "Your Quartz site is ready! Mark notes with 'publish: true' to get started.",
		});

		if (this.pagesConfig?.url) {
			this.contentEl.createEl("p", {
				text: `Site URL: ${this.pagesConfig.url}`,
			});
		}
	}

	private renderError(): void {
		if (!this.errorMessage) return;
		this.contentEl.createEl("p", {
			text: this.errorMessage,
			cls: "qs-onboarding-error",
		});
	}

	private canGoBack(): boolean {
		return this.step !== "token";
	}

	private goBack(): void {
		switch (this.step) {
			case "flow":
				this.step = "token";
				break;
			case "create":
			case "connect":
				this.step = "flow";
				break;
			case "configure":
				this.step = this.createdRepo ? "create" : "connect";
				break;
			case "success":
				this.step = "configure";
				break;
		}
		this.errorMessage = "";
		this.render();
	}

	private async handleValidateToken(): Promise<void> {
		if (!this.token) {
			this.errorMessage = "Token is required.";
			this.render();
			return;
		}
		this.isBusy = true;
		this.errorMessage = "";
		this.render();
		try {
			const service = this.getService();
			this.user = await service.validateToken(this.token);
			this.step = "flow";
		} catch (error) {
			this.errorMessage = this.formatError(error);
		} finally {
			this.isBusy = false;
			this.render();
		}
	}

	private async handleLoadRepos(): Promise<void> {
		this.isBusy = true;
		this.errorMessage = "";
		this.step = "connect";
		this.render();
		try {
			const service = this.getService();
			this.repos = await service.listRepos();
			this.selectedRepo = this.repos[0] ?? null;
		} catch (error) {
			this.errorMessage = this.formatError(error);
		} finally {
			this.isBusy = false;
			this.render();
		}
	}

	private async handleCreateSite(): Promise<void> {
		if (!this.newSiteName) {
			this.errorMessage = "Site name is required.";
			this.render();
			return;
		}
		this.isBusy = true;
		this.errorMessage = "";
		this.render();
		try {
			const service = this.getService();
			const repo = await service.createFromTemplate(this.newSiteName);
			this.createdRepo = repo;
			const [owner, name] = repo.full_name.split("/");
			if (!owner || !name) {
				throw new Error("Unable to determine repository owner");
			}
			this.pagesConfig = await service.enablePages(owner, name);
			this.step = "configure";
		} catch (error) {
			this.errorMessage = this.formatError(error);
		} finally {
			this.isBusy = false;
			this.render();
		}
	}

	private async handleConfigure(repo: GitHubRepo): Promise<void> {
		this.isBusy = true;
		this.errorMessage = "";
		this.render();
		try {
			this.plugin.settings.gitRemoteUrl = repo.clone_url;
			this.plugin.settings.gitBranch = repo.default_branch || "v4";
			this.plugin.settings.gitAuthType = "bearer";
			this.plugin.settings.gitProviderHint = "github";
			this.plugin.secretStorageService.setToken(this.token);
			await this.plugin.saveSettings();
			this.step = "success";
		} catch (error) {
			this.errorMessage = this.formatError(error);
		} finally {
			this.isBusy = false;
			this.render();
		}
	}

	private getService(): GitHubApiService {
		if (!this.apiService) {
			this.apiService = new GitHubApiService(this.token);
		}
		return this.apiService;
	}

	private formatError(error: unknown): string {
		if (error instanceof Error) return error.message;
		return String(error);
	}
}
