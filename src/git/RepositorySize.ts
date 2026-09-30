import type { HttpClient } from "src/git/HttpClient";

/**
 * Ask a hosting provider how large a repository is, before deciding whether it
 * can safely be cloned whole.
 *
 * Git itself cannot answer this: `ls-remote` returns refs, not object sizes, and
 * pack size is only known once the server has already started sending it. So
 * the estimate has to come from the provider's own API, and is best-effort by
 * nature — an unrecognised host or a private repository without a usable token
 * yields `null`, which callers must treat as "unknown", not "small".
 */
export interface RepositoryHost {
	kind: "github" | "gitlab" | "gitea";
	apiUrl: string;
}

const KIB = 1024;

/**
 * Classify a remote URL into a provider and the API endpoint that reports size.
 *
 * Gitea and Forgejo share an API shape and are self-hosted under arbitrary
 * domains, so they are the fallback rather than a matched host: any origin can
 * be one, and a wrong guess only costs one 404.
 */
export function identifyHost(remoteUrl: string): RepositoryHost | null {
	const match = /^(?:https?:\/\/|git@)([^/:]+)[/:](.+?)(?:\.git)?\/?$/.exec(
		remoteUrl,
	);

	if (!match) return null;

	const host = match[1];
	const path = match[2];

	if (host === undefined || path === undefined) return null;

	if (host === "github.com") {
		return {
			kind: "github",
			apiUrl: `https://api.github.com/repos/${path}`,
		};
	}

	if (host === "gitlab.com" || host.startsWith("gitlab.")) {
		return {
			kind: "gitlab",
			apiUrl: `https://${host}/api/v4/projects/${encodeURIComponent(path)}?statistics=true`,
		};
	}

	return {
		kind: "gitea",
		apiUrl: `https://${host}/api/v1/repos/${path}`,
	};
}

interface GitHubRepo {
	size?: number;
}

interface GitLabProject {
	statistics?: { repository_size?: number };
}

interface GiteaRepo {
	size?: number;
}

/**
 * @returns Repository size in bytes, or null when it cannot be determined.
 */
export async function fetchRepositorySize(
	remoteUrl: string,
	http: HttpClient,
	token?: string,
): Promise<number | null> {
	const host = identifyHost(remoteUrl);

	if (!host) return null;

	const headers: Record<string, string> = token
		? host.kind === "gitlab"
			? { "PRIVATE-TOKEN": token }
			: { Authorization: `Bearer ${token}` }
		: {};

	try {
		if (host.kind === "gitlab") {
			const response = await http.get<GitLabProject>(
				host.apiUrl,
				headers,
			);

			// Reported in bytes, and only to callers allowed to see statistics.
			return response.data.statistics?.repository_size ?? null;
		}

		const response = await http.get<GitHubRepo | GiteaRepo>(
			host.apiUrl,
			headers,
		);

		// Both GitHub and Gitea report kibibytes.
		return typeof response.data.size === "number"
			? response.data.size * KIB
			: null;
	} catch {
		return null;
	}
}
