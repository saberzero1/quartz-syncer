import git, { type HttpClient } from "isomorphic-git";
import { requestUrl } from "obsidian";
import type { GitAuth, GitRemoteSettings } from "src/models/settings";

export interface RepositoryFile {
	content: string;
	sha: string;
	path: string;
	type: "file";
}

export interface RepositoryDirectoryEntry {
	name: string;
	type: "blob" | "tree";
}

interface RepositoryConnectionInput {
	gitSettings: GitRemoteSettings;
	contentFolder: string;
	vaultPath: string;
}

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
			console.error("HTTP request failed", error);
			throw error;
		}
	},
};

export class RepositoryConnection {
	constructor(_input: RepositoryConnectionInput) {}

	async getRawFile(_path: string): Promise<RepositoryFile | undefined> {
		return undefined;
	}

	async writeRawFiles(
		_files: Map<string, string>,
		_commitMessage = "Update repository files",
	): Promise<void> {
		console.debug(
			"RepositoryConnection.writeRawFiles: not available in v2. Use Publisher instead.",
		);
	}

	async listDirectory(
		_path: string,
	): Promise<RepositoryDirectoryEntry[]> {
		return [];
	}

	async hasCommitInHistory(_targetOid: string): Promise<boolean> {
		return false;
	}

	async upgradeFromUpstream(
		_upstreamUrl: string,
		_upstreamBranch: string,
	): Promise<{ oid: string; alreadyMerged: boolean }> {
		console.debug(
			"Quartz upstream upgrade is not yet available in v2. Please run 'npx quartz update' manually.",
		);
		return { oid: "", alreadyMerged: true };
	}

	private static getOnAuth(auth: GitAuth) {
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

	static async fetchRemoteHeadCommit(
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
				onAuth: this.getOnAuth(auth),
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

	static async fetchRemoteBranches(
		remoteUrl: string,
		auth: GitAuth,
		corsProxyUrl?: string,
	): Promise<{ branches: string[]; defaultBranch: string | null }> {
		try {
			const refs = await git.listServerRefs({
				http: obsidianHttpClient,
				url: remoteUrl,
				corsProxy: corsProxyUrl,
				onAuth: this.getOnAuth(auth),
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
			console.error("Failed to fetch remote branches", error);

			return { branches: [], defaultBranch: null };
		}
	}

	/**
	 * Checks if the provided credentials have write (push) access to the remote.
	 * Uses `listServerRefs` with `forPush: true` to query the `git-receive-pack`
	 * endpoint. If the server responds with refs, the credentials have push access.
	 * A 401/403 response indicates read-only or no push access.
	 */
	static async checkWriteAccess(
		remoteUrl: string,
		auth: GitAuth,
		corsProxyUrl?: string,
	): Promise<boolean> {
		try {
			await git.listServerRefs({
				http: obsidianHttpClient,
				url: remoteUrl,
				corsProxy: corsProxyUrl,
				onAuth: this.getOnAuth(auth),
				forPush: true,
				prefix: "refs/heads/",
			});

			return true;
		} catch {
			return false;
		}
	}
}
