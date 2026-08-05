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
		this.cachedUser = response.data;
		return response.data;
	}

	async listRepos(): Promise<GitHubRepo[]> {
		this.assertToken();
		const allRepos: GitHubRepo[] = [];
		let page = 1;
		const perPage = 100;

		while (true) {
			const response = await this.client.get<GitHubRepo[]>(
				`${BASE_URL}/user/repos?type=owner&sort=updated&per_page=${perPage}&page=${page}`,
				this.getHeaders(),
			);

			allRepos.push(...response.data);

			if (response.data.length < perPage) break;

			page += 1;
		}

		return allRepos;
	}

	async createFromTemplate(
		name: string,
		isPrivate = false,
	): Promise<GitHubRepo> {
		this.assertToken();
		const user = await this.getUser();
		const response = await this.client.post<GitHubRepo>(
			`${BASE_URL}/repos/jackyzha0/quartz/generate`,
			this.getHeaders(),
			{ owner: user.login, name, private: isPrivate },
		);
		return response.data;
	}

	async enablePages(owner: string, repo: string): Promise<GitHubPagesConfig> {
		this.assertToken();
		const branch = (await this.getDefaultBranch(owner, repo)) || "v5";
		const response = await this.client.post<GitHubPagesConfig>(
			`${BASE_URL}/repos/${owner}/${repo}/pages`,
			this.getHeaders(),
			{ build_type: "workflow", source: { branch, path: "/" } },
		);
		return response.data;
	}

	async createFile(
		owner: string,
		repo: string,
		path: string,
		content: string,
		message: string,
		branch: string,
	): Promise<void> {
		this.assertToken();
		const encoded = btoa(content);
		await this.client.put(
			`${BASE_URL}/repos/${owner}/${repo}/contents/${path}`,
			this.getHeaders(),
			{ message, content: encoded, branch },
		);
	}

	async getFileContent(
		owner: string,
		repo: string,
		path: string,
		branch: string,
	): Promise<{ content: string; sha: string } | null> {
		this.assertToken();
		try {
			const response = await this.client.get<{
				content: string;
				sha: string;
				encoding: string;
			}>(
				`${BASE_URL}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
				this.getHeaders(),
			);

			const content =
				response.data.encoding === "base64"
					? atob(response.data.content.replace(/\n/g, ""))
					: response.data.content;

			return { content, sha: response.data.sha };
		} catch {
			return null;
		}
	}

	async updateFile(
		owner: string,
		repo: string,
		path: string,
		content: string,
		message: string,
		branch: string,
		sha: string,
	): Promise<void> {
		this.assertToken();
		const encoded = btoa(content);
		await this.client.put(
			`${BASE_URL}/repos/${owner}/${repo}/contents/${path}`,
			this.getHeaders(),
			{ message, content: encoded, branch, sha },
		);
	}

	async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
		this.assertToken();
		const response = await this.client.get<GitHubRepo>(
			`${BASE_URL}/repos/${owner}/${repo}`,
			this.getHeaders(),
		);
		return response.data;
	}

	async getDefaultBranch(owner: string, repo: string): Promise<string> {
		const details = await this.getRepo(owner, repo);
		return details.default_branch;
	}

	async getUser(): Promise<GitHubUser> {
		if (this.cachedUser) return this.cachedUser;
		return this.validateToken(this.token);
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
}
