import { GitHubApiService } from "src/github/GitHubApiService";
import type { GitHubRepo, GitHubUser } from "src/github/types";
import type QuartzSyncer from "src/main";
import { ConflictError, NotFoundError } from "src/git/errors";

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

export interface CreateRepoResult {
	repo: GitHubRepo;
	pagesWarning: string | null;
}

export interface OnboardingConfig {
	repoUrl: string;
	branch: string;
	authType: "bearer";
	providerHint: "github";
}

export class OnboardingService {
	private apiService: GitHubApiService | null = null;

	constructor(private plugin: QuartzSyncer) {}

	async testToken(token: string): Promise<GitHubUser> {
		const service = this.getService(token);
		return service.validateToken(token);
	}

	async listRepos(token: string): Promise<GitHubRepo[]> {
		const service = this.getService(token);
		return service.listRepos();
	}

	async createRepo(
		token: string,
		name: string,
		isPrivate: boolean,
	): Promise<CreateRepoResult> {
		const service = this.getService(token);
		const user = await service.getUser();

		try {
			await service.getRepo(user.login, name);
			throw new ConflictError(
				"A repository with this name already exists on your account.",
			);
		} catch (error) {
			if (!(error instanceof NotFoundError)) {
				// Proceed with creation
			}
		}

		const repo = await service.createFromTemplate(name, isPrivate);
		const [owner, repoName] = repo.full_name.split("/");
		if (!owner || !repoName) {
			throw new Error("Unable to determine repository owner");
		}

		const branch = "v5";
		await this.waitForTemplateReady(service, owner, repoName, branch);

		let pagesWarning: string | null = null;

		try {
			await service.createFile(
				owner,
				repoName,
				".github/workflows/deploy.yml",
				DEPLOY_WORKFLOW,
				"Add GitHub Pages deploy workflow",
				branch,
			);
		} catch {
			pagesWarning =
				"Repository created successfully. The deploy workflow could not be added automatically — see the Quartz documentation for manual setup.";
		}

		try {
			await service.createFile(
				owner,
				repoName,
				"content/index.md",
				INDEX_CONTENT,
				"Add initial index page",
				branch,
			);
		} catch {
			// No-op
		}

		try {
			const baseUrl = `${owner}.github.io/${repoName}`;
			await this.updateQuartzConfig(
				service,
				owner,
				repoName,
				branch,
				baseUrl,
			);
		} catch {
			// No-op
		}

		try {
			await service.enablePages(owner, repoName);
		} catch {
			if (!pagesWarning) {
				pagesWarning =
					"Repository created successfully. GitHub Pages could not be enabled automatically — you can enable it manually in your repository settings.";
			}
		}

		return { repo, pagesWarning };
	}

	async connectRepo(
		token: string,
		repoFullName: string,
	): Promise<GitHubRepo> {
		const service = this.getService(token);
		const [owner, name] = repoFullName.split("/");
		if (!owner || !name) {
			throw new Error(
				"Invalid repository name format. Expected 'owner/repo'.",
			);
		}
		return service.getRepo(owner, name);
	}

	async configure(
		token: string,
		repo: GitHubRepo,
		branch?: string,
	): Promise<void> {
		this.plugin.settings.gitRemoteUrl = repo.clone_url;
		this.plugin.settings.gitBranch = branch ?? repo.default_branch ?? "v5";
		this.plugin.settings.gitAuthType = "bearer";
		this.plugin.settings.gitProviderHint = "github";
		this.plugin.secretStorageService.setToken(token);
		await this.plugin.saveSettings();
	}

	private getService(token: string): GitHubApiService {
		if (!this.apiService) {
			this.apiService = new GitHubApiService(token);
		}
		return this.apiService;
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
			await new Promise((resolve) => setTimeout(resolve, delayMs));
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
}
