import git, { type HttpClient } from "isomorphic-git";
import { requestUrl } from "obsidian";
import type { GitAuth } from "src/models/settings";

async function collectBody(
	body: AsyncIterableIterator<Uint8Array> | undefined,
): Promise<Uint8Array | undefined> {
	if (!body) return undefined;

	const chunks: Uint8Array[] = [];

	for await (const chunk of body) {
		chunks.push(chunk);
	}

	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;

	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

const obsidianHttpClient: HttpClient = {
	async request(config) {
		const { url, method = "GET", headers = {}, body } = config;

		try {
			const bodyData = await collectBody(body);

			const response = await requestUrl({
				url,
				method,
				headers,
				body: bodyData ? (bodyData.buffer as ArrayBuffer) : undefined,
				throw: false,
			});

			const responseHeaders: Record<string, string> = {};

			if (response.headers) {
				for (const [key, value] of Object.entries(response.headers)) {
					responseHeaders[key.toLowerCase()] = value;
				}
			}

			const responseBody = new Uint8Array(response.arrayBuffer);

			async function* bodyIterator(): AsyncIterableIterator<Uint8Array> {
				yield responseBody;
			}

			return {
				url,
				method,
				headers: responseHeaders,
				body: bodyIterator(),
				statusCode: response.status,
				statusMessage:
					response.status >= 200 && response.status < 300
						? "OK"
						: "Error",
			};
		} catch (error) {
			console.debug("HTTP request failed", error);
			throw error;
		}
	},
};

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
			http: obsidianHttpClient,
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
			http: obsidianHttpClient,
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
			http: obsidianHttpClient,
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
