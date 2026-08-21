import git from "isomorphic-git";
import type { GitAuth } from "src/models/settings";
import { HttpClient } from "src/git/HttpClient";

const httpClient = new HttpClient({ maxRetries: 0 });

function getOnAuth(auth: GitAuth) {
	if (auth.type === "none") {
		return undefined;
	}

	if (auth.type === "bearer") {
		return () => ({
			username: "x-access-token",
			password: auth.secret || "",
		});
	}

	return () => ({
		username: auth.username || "",
		password: auth.secret || "",
	});
}

export async function fetchRemoteHeadCommit(
	remoteUrl: string,
	auth: GitAuth,
	ref?: string,
	corsProxyUrl?: string,
): Promise<string | null> {
	try {
		const prefix = ref ? `refs/heads/${ref}` : "HEAD";

		const refs = await git.listServerRefs({
			http: httpClient,
			url: remoteUrl,
			corsProxy: corsProxyUrl,
			onAuth: getOnAuth(auth),
			prefix,
			symrefs: true,
		});

		if (ref) {
			const match = refs.find((r) => r.ref === `refs/heads/${ref}`);

			return match?.oid ?? null;
		}

		const head = refs.find((r) => r.ref === "HEAD");

		return head?.oid ?? null;
	} catch (error) {
		console.debug("Failed to fetch remote HEAD commit", error);

		return null;
	}
}

export async function fetchRemoteBranches(
	remoteUrl: string,
	auth: GitAuth,
	corsProxyUrl?: string,
): Promise<{ branches: string[]; defaultBranch: string | null }> {
	try {
		const refs = await git.listServerRefs({
			http: httpClient,
			url: remoteUrl,
			corsProxy: corsProxyUrl,
			onAuth: getOnAuth(auth),
			prefix: "refs/heads/",
			symrefs: true,
		});

		const branches = refs
			.filter((ref) => ref.ref.startsWith("refs/heads/"))
			.map((ref) => ref.ref.replace("refs/heads/", ""));

		let defaultBranch: string | null = null;
		const headRef = refs.find((ref) => ref.ref === "HEAD");

		if (headRef?.target) {
			defaultBranch = headRef.target.replace("refs/heads/", "");
		}

		return { branches, defaultBranch };
	} catch (error) {
		console.debug("Failed to fetch remote branches", error);

		return { branches: [], defaultBranch: null };
	}
}

export async function checkWriteAccess(
	remoteUrl: string,
	auth: GitAuth,
	corsProxyUrl?: string,
): Promise<boolean> {
	try {
		await git.listServerRefs({
			http: httpClient,
			url: remoteUrl,
			corsProxy: corsProxyUrl,
			onAuth: getOnAuth(auth),
			forPush: true,
			prefix: "refs/heads/",
		});

		return true;
	} catch {
		return false;
	}
}
