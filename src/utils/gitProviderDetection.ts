import type { GitProviderHint } from "src/models/settings";

export function detectGitProvider(url: string): GitProviderHint {
	try {
		const hostname = new URL(url).hostname.toLowerCase();

		if (hostname === "github.com" || hostname.endsWith(".github.com")) {
			return "github";
		}

		if (hostname === "gitlab.com" || hostname.endsWith(".gitlab.com")) {
			return "gitlab";
		}

		if (
			hostname === "bitbucket.org" ||
			hostname.endsWith(".bitbucket.org")
		) {
			return "bitbucket";
		}

		if (hostname === "codeberg.org") {
			return "gitea";
		}

		return "custom";
	} catch {
		return "custom";
	}
}
