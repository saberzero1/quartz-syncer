import { App, Modal } from "obsidian";
import type QuartzSyncer from "src/main";
import { GitHubApiService } from "src/github/GitHubApiService";
import type {
	GitHubPagesConfig,
	GitHubRepo,
	GitHubUser,
} from "src/github/types";
import {
	AuthError,
	ConflictError,
	NetworkError,
	NotFoundError,
	RateLimitError,
} from "src/git/errors";

const DEPLOY_WORKFLOW = `name: Deploy Quartz site to GitHub Pages

on:
  push:
    branches:
      - v5

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - name: Cache dependencies
        uses: actions/cache@v5
        with:
          path: ~/.npm
          key: \${{ runner.os }}-node-\${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            \${{ runner.os }}-node-
      - name: Cache Quartz plugins
        uses: actions/cache@v5
        with:
          path: .quartz/plugins
          key: \${{ runner.os }}-plugins-\${{ hashFiles('quartz.lock.json') }}
          restore-keys: |
            \${{ runner.os }}-plugins-
      - name: Install dependencies
        run: npm ci
      - name: Install Quartz plugins
        run: npx quartz plugin install
      - name: Build Quartz
        run: npx quartz build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: public

  deploy:
    needs: build
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

const INDEX_CONTENT = `---
title: Welcome
publish: true
---

Welcome to your Quartz site! This is your home page.

Edit this note in Obsidian, then publish it with Quartz Syncer.
`;

type WizardStep =
	| "token"
	| "flow"
	| "create"
	| "connect"
	| "configure"
	| "success";

const REPO_NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,98}[a-zA-Z0-9])?$/;
const REPO_NAME_CHARS = /^[a-zA-Z0-9._-]+$/;
const REPO_NAME_MAX = 100;

export function isValidRepoName(name: string): boolean {
	if (!name || name.length > REPO_NAME_MAX) return false;

	return REPO_NAME_REGEX.test(name);
}

export function formatWizardError(error: unknown): string {
	if (error instanceof ConflictError) {
		return "A repository with this name already exists on your account.";
	}

	if (error instanceof AuthError) {
		return "Your token doesn't have permission for this action. Check your token's scopes.";
	}

	if (error instanceof NotFoundError) {
		return "The Quartz template repository is not available.";
	}

	if (error instanceof NetworkError) {
		return "Unable to connect to GitHub. Check your internet connection.";
	}

	if (error instanceof RateLimitError) {
		return "GitHub API rate limit reached. Please wait a moment and try again.";
	}

	if (error instanceof Error) return error.message;

	return String(error);
}

export function getRepoNameError(name: string): string | null {
	if (!name) return "Repository name is required";

	if (name.length > REPO_NAME_MAX) {
		return `Repository name must be ${REPO_NAME_MAX} characters or fewer`;
	}

	if (!REPO_NAME_CHARS.test(name)) {
		return "Repository name can only contain letters, numbers, hyphens, periods, and underscores";
	}

	if (name.startsWith(".") || name.startsWith("-")) {
		return "Repository name cannot start with a period or hyphen";
	}

	if (name.endsWith(".") || name.endsWith("-")) {
		return "Repository name cannot end with a period or hyphen";
	}

	return null;
}

export class OnboardingWizard extends Modal {
	private plugin: QuartzSyncer;
	private step: WizardStep = "token";
	private token = "";
	private user: GitHubUser | null = null;
	private repos: GitHubRepo[] = [];
	private selectedRepo: GitHubRepo | null = null;
	private createdRepo: GitHubRepo | null = null;
	private pagesConfig: GitHubPagesConfig | null = null;
	private pagesWarning = "";
	private errorMessage = "";
	private isBusy = false;
	private apiService: GitHubApiService | null = null;
	private newSiteName = "";
	private isPrivate = false;

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
			text: "Enter your GitHub personal access token to continue.",
		});

		const linkContainer = this.contentEl.createDiv("qs-onboarding-helper");
		const linkEl = linkContainer.createEl("a", {
			text: "Generate a classic token",
			href: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Quartz+Syncer",
		});
		linkEl.setAttr("target", "_blank");
		linkContainer.appendText(
			" with repo and workflow scopes. Alternatively, use a ",
		);
		const fineGrainedLink = linkContainer.createEl("a", {
			text: "fine-grained token",
			href: "https://github.com/settings/personal-access-tokens/new",
		});
		fineGrainedLink.setAttr("target", "_blank");
		linkContainer.appendText(
			" with Contents, Workflows, and Administration permissions (read and write).",
		);

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
			placeholder: "quartz",
			cls: "qs-onboarding-site-name",
		});
		inputEl.value = this.newSiteName;

		const validationEl = this.contentEl.createDiv(
			"qs-onboarding-validation",
		);

		const nameError = getRepoNameError(this.newSiteName);

		if (this.newSiteName && nameError) {
			validationEl.setText(nameError);
		}

		inputEl.addEventListener("input", () => {
			this.newSiteName = inputEl.value.trim();
			const error = getRepoNameError(this.newSiteName);

			if (this.newSiteName && error) {
				validationEl.setText(error);
				validationEl.show();
			} else {
				validationEl.setText("");
				validationEl.hide();
			}

			createBtn.disabled =
				this.isBusy ||
				!this.newSiteName ||
				!isValidRepoName(this.newSiteName);
		});

		const toggleContainer = this.contentEl.createDiv(
			"qs-onboarding-toggle",
		);
		const toggleLabel = toggleContainer.createEl("label");
		const checkboxEl = toggleLabel.createEl("input", { type: "checkbox" });
		checkboxEl.checked = this.isPrivate;
		toggleLabel.appendText(" Make repository private");
		checkboxEl.addEventListener("change", () => {
			this.isPrivate = checkboxEl.checked;
		});
		toggleContainer.createEl("p", {
			text: "Private repositories require GitHub Pro for GitHub Pages",
			cls: "qs-onboarding-helper",
		});

		const createBtn = this.contentEl.createEl("button", {
			text: this.isBusy ? "Creating..." : "Create site",
			cls: "qs-onboarding-create-confirm",
		});
		createBtn.disabled =
			this.isBusy ||
			!this.newSiteName ||
			!isValidRepoName(this.newSiteName);
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

		const filterInput = this.contentEl.createEl("input", {
			type: "text",
			placeholder: "Filter repositories\u2026",
			cls: "qs-onboarding-repo-filter",
		});

		const selectEl = this.contentEl.createEl("select", {
			cls: "qs-onboarding-repo-select",
		});
		selectEl.size = 8;

		const populateSelect = (filter: string): void => {
			selectEl.empty();
			const query = filter.toLowerCase();
			const filtered = query
				? this.repos.filter((repo) =>
						repo.full_name.toLowerCase().includes(query),
					)
				: this.repos;

			for (const repo of filtered) {
				selectEl.createEl("option", {
					text: repo.full_name,
					value: repo.full_name,
				});
			}

			if (filtered.length === 0) {
				selectEl.createEl("option", {
					text: "No repositories match your search.",
					value: "",
				});
			}
		};

		populateSelect("");

		filterInput.addEventListener("input", () => {
			populateSelect(filterInput.value.trim());
		});

		if (this.selectedRepo) {
			selectEl.value = this.selectedRepo.full_name;
		}

		selectEl.addEventListener("change", () => {
			const selected = this.repos.find(
				(repo) => repo.full_name === selectEl.value,
			);
			this.selectedRepo = selected ?? null;
		});

		this.contentEl.createDiv({ cls: "qs-onboarding-helper" }).createSpan({
			text: `${this.repos.length} repositories loaded.`,
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
		const displayBranch = this.createdRepo
			? "v5"
			: repo.default_branch || "v5";
		this.contentEl.createEl("p", {
			text: `Branch: ${displayBranch}`,
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

		const repo = this.createdRepo ?? this.selectedRepo;
		if (repo) {
			const [owner] = repo.full_name.split("/");
			const repoName = repo.full_name.split("/")[1] ?? "";
			const pagesUrl = `https://${owner}.github.io/${repoName}/`;
			const urlContainer = this.contentEl.createEl("p");
			urlContainer.createSpan({ text: "Site URL: " });
			const urlLink = urlContainer.createEl("a", {
				text: pagesUrl,
				href: pagesUrl,
			});
			urlLink.setAttr("target", "_blank");
		}

		if (this.pagesWarning) {
			this.contentEl.createEl("p", {
				text: this.pagesWarning,
				cls: "qs-onboarding-warning",
			});
		}

		const doneButton = this.contentEl.createEl("button", {
			cls: "mod-cta",
			text: "Done",
		});
		doneButton.style.marginTop = "1em";
		doneButton.addEventListener("click", () => {
			this.close();
		});
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
		if (!this.newSiteName || !isValidRepoName(this.newSiteName)) {
			this.errorMessage =
				getRepoNameError(this.newSiteName) ?? "Site name is required.";
			this.render();
			return;
		}
		this.isBusy = true;
		this.errorMessage = "";
		this.render();
		try {
			const service = this.getService();

			const user = await service.getUser();

			try {
				await service.getRepo(user.login, this.newSiteName);
				this.errorMessage =
					"A repository with this name already exists on your account.";
				this.isBusy = false;
				this.render();
				return;
			} catch (e) {
				if (!(e instanceof NotFoundError)) {
					// Non-404 error during check — proceed with creation anyway
				}
			}

			const repo = await service.createFromTemplate(
				this.newSiteName,
				this.isPrivate,
			);
			this.createdRepo = repo;
			const [owner, name] = repo.full_name.split("/");
			if (!owner || !name) {
				throw new Error("Unable to determine repository owner");
			}

			const branch = "v5";

			await this.waitForTemplateReady(service, owner, name, branch);

			try {
				await service.createFile(
					owner,
					name,
					".github/workflows/deploy.yml",
					DEPLOY_WORKFLOW,
					"Add GitHub Pages deploy workflow",
					branch,
				);
			} catch {
				this.pagesWarning =
					"Repository created successfully. The deploy workflow could not be added automatically \u2014 see the Quartz documentation for manual setup.";
			}

			try {
				await service.createFile(
					owner,
					name,
					"content/index.md",
					INDEX_CONTENT,
					"Add initial index page",
					branch,
				);
			} catch {
				console.debug(
					"Could not create content/index.md — may already exist",
				);
			}

			try {
				const baseUrl = `${owner}.github.io/${name}`;
				await this.updateQuartzConfig(
					service,
					owner,
					name,
					branch,
					baseUrl,
				);
			} catch {
				console.debug("Could not update quartz.config.yaml");
			}

			try {
				this.pagesConfig = await service.enablePages(owner, name);
			} catch {
				if (!this.pagesWarning) {
					this.pagesWarning =
						"Repository created successfully. GitHub Pages could not be enabled automatically \u2014 you can enable it manually in your repository settings.";
				}
			}

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
			this.plugin.settings.gitBranch = this.createdRepo
				? "v5"
				: repo.default_branch || "v5";
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

	private async waitForTemplateReady(
		service: GitHubApiService,
		owner: string,
		repo: string,
		branch: string,
	): Promise<void> {
		const maxAttempts = 15;
		const delayMs = 2000;

		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, delayMs));

			const file = await service.getFileContent(
				owner,
				repo,
				"package.json",
				branch,
			);

			if (file) return;
		}
	}

	private async updateQuartzConfig(
		service: GitHubApiService,
		owner: string,
		repo: string,
		branch: string,
		baseUrl: string,
	): Promise<void> {
		const existing = await service.getFileContent(
			owner,
			repo,
			"quartz.config.yaml",
			branch,
		);

		if (existing) return;

		const defaultConfig = await service.getFileContent(
			owner,
			repo,
			"quartz.config.default.yaml",
			branch,
		);

		if (!defaultConfig) return;

		const content = this.applyBaseUrl(defaultConfig.content, baseUrl);

		await service.createFile(
			owner,
			repo,
			"quartz.config.yaml",
			content,
			"Configure site for GitHub Pages",
			branch,
		);
	}

	private applyBaseUrl(configContent: string, baseUrl: string): string {
		let content = configContent;

		content = content.replace(/baseUrl:\s*.*/, `baseUrl: ${baseUrl}`);

		content = content.replace(
			/markdownLinkResolution:\s*.*/,
			"markdownLinkResolution: shortest",
		);

		return content;
	}

	private getService(): GitHubApiService {
		if (!this.apiService) {
			this.apiService = new GitHubApiService(this.token);
		}
		return this.apiService;
	}

	private formatError(error: unknown): string {
		return formatWizardError(error);
	}
}
