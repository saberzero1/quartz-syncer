import { HttpClient } from "src/git/HttpClient";
import type {
	GitHubPagesConfig,
	GitHubRepo,
	GitHubUser,
} from "src/github/types";

const BASE_URL = "https://api.github.com";

export class GitHubApiService {
	private token: string;
	private client: HttpClient;
	private cachedUser: GitHubUser | null = null;

	constructor(token = "", client: HttpClient = new HttpClient()) {
		this.token = token;
		this.client = client;
	}

	async validateToken(token: string): Promise<GitHubUser> {
		this.token = token;
		const response = await this.client.get<GitHubUser>(
			`${BASE_URL}/user`,
			this.getHeaders(),
		);
		if (response.status !== 200) {
			throw new Error("Unexpected response from GitHub");
		}
		this.cachedUser = response.data;
		return response.data;
	}

	async listRepos(): Promise<GitHubRepo[]> {
		this.assertToken();
		const response = await this.client.get<GitHubRepo[]>(
			`${BASE_URL}/user/repos?type=owner&sort=updated&per_page=100`,
			this.getHeaders(),
		);
		if (response.status !== 200) {
			throw new Error("Unexpected response from GitHub");
		}
		return response.data;
	}

	async createFromTemplate(name: string): Promise<GitHubRepo> {
		this.assertToken();
		const user = await this.getUser();
		const response = await this.client.post<GitHubRepo>(
			`${BASE_URL}/repos/jackyzha0/quartz/generate`,
			this.getHeaders(),
			{ owner: user.login, name, private: false },
		);
		if (response.status !== 201 && response.status !== 200) {
			throw new Error("Unexpected response from GitHub");
		}
		return response.data;
	}

	async enablePages(owner: string, repo: string): Promise<GitHubPagesConfig> {
		this.assertToken();
		const branch = (await this.getDefaultBranch(owner, repo)) || "v4";
		const response = await this.client.post<GitHubPagesConfig>(
			`${BASE_URL}/repos/${owner}/${repo}/pages`,
			this.getHeaders(),
			{ source: { branch, path: "/" } },
		);
		if (response.status < 200 || response.status >= 300) {
			throw new Error("Unexpected response from GitHub");
		}
		return response.data;
	}

	async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
		this.assertToken();
		const response = await this.client.get<GitHubRepo>(
			`${BASE_URL}/repos/${owner}/${repo}`,
			this.getHeaders(),
		);
		if (response.status !== 200) {
			throw new Error("Unexpected response from GitHub");
		}
		return response.data;
	}

	async getDefaultBranch(owner: string, repo: string): Promise<string> {
		const details = await this.getRepo(owner, repo);
		return details.default_branch;
	}

	private getHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.token}`,
			Accept: "application/vnd.github+json",
		};
	}

	private assertToken(): void {
		if (!this.token) {
			throw new Error("GitHub token is required");
		}
	}

	private async getUser(): Promise<GitHubUser> {
		if (this.cachedUser) return this.cachedUser;
		return this.validateToken(this.token);
	}
}
