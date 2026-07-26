export interface GitHubUser {
	login: string;
	name?: string;
}

export interface GitHubRepo {
	full_name: string;
	html_url: string;
	clone_url: string;
	default_branch: string;
	private: boolean;
}

export interface GitHubPagesConfig {
	url: string;
	status: string;
}
