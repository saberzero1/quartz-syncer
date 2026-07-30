import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import type { App } from "obsidian";
import { HttpClient } from "src/git/HttpClient";
import type {
	BranchInfo,
	CommitResult,
	ConnectionTestResult,
	FileChange,
	GitBackend,
	GitBackendConfig,
	RemoteInfo,
	TreeEntry,
} from "src/git/types";

type AuthCredentials = { username: string; password: string };

const COMMIT_AUTHOR = {
	name: "Quartz Syncer",
	email: "268450573+quartz-syncer-publisher[bot]@users.noreply.github.com",
};

export class BundledGitBackend implements GitBackend {
	private config: GitBackendConfig;
	private fs: LightningFS;
	private http: HttpClient;
	private cache: Record<string, unknown>;
	private dir: string;
	private initialized = false;

	constructor(config: GitBackendConfig, _app: App) {
		this.config = config;
		this.dir = "/repo";
		this.fs = new LightningFS(buildFsName(config.remoteUrl, config.branch));
		this.http = new HttpClient();
		this.cache = {};
	}

	async readTree(ref: string): Promise<TreeEntry[]> {
		await this.ensureRepoReady(this.config.branch);
		const commitOid = await git.resolveRef({
			fs: this.fs,
			dir: this.dir,
			ref: `origin/${ref}`,
		});
		const { commit } = await git.readCommit({
			fs: this.fs,
			dir: this.dir,
			oid: commitOid,
		});

		const entries: TreeEntry[] = [];
		await git.walk({
			fs: this.fs,
			dir: this.dir,
			trees: [git.TREE({ ref: commit.tree })],
			map: async (filepath, [entry]) => {
				if (!entry || !filepath || filepath === ".") return undefined;
				const type = await entry.type();
				if (type === "tree" || type === "blob") {
					entries.push({
						path: filepath,
						sha: await entry.oid(),
						type,
					});
				}
				return undefined;
			},
		});
		return entries;
	}

	async readBlob(sha: string): Promise<Uint8Array> {
		await this.ensureRepoReady(this.config.branch);
		const { blob } = await git.readBlob({
			fs: this.fs,
			dir: this.dir,
			oid: sha,
		});
		return blob;
	}

	async writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<CommitResult> {
		await this.ensureRepoReady(branch);

		const remoteCommit = await git.resolveRef({
			fs: this.fs,
			dir: this.dir,
			ref: `origin/${branch}`,
		});
		await this.resetToCommit(remoteCommit, branch);

		const cache = {};
		for (const file of files) {
			await this.ensureParentDir(file.path);
			const data = this.toWriteData(file);
			const encoding = typeof data === "string" ? "utf8" : undefined;
			await this.fs.promises.writeFile(
				`${this.dir}/${file.path}`,
				data,
				encoding,
			);
		}

		const filepaths = files.map((f) => f.path);
		await git.add({
			fs: this.fs,
			dir: this.dir,
			filepath: filepaths,
			cache,
		});

		const sha = await git.commit({
			fs: this.fs,
			dir: this.dir,
			message,
			author: COMMIT_AUTHOR,
			cache,
		});

		await this.pushWithRetry(branch);
		return { sha };
	}

	async deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<CommitResult> {
		if (paths.length === 0) return { sha: "" };
		await this.ensureRepoReady(branch);

		const remoteCommit = await git.resolveRef({
			fs: this.fs,
			dir: this.dir,
			ref: `origin/${branch}`,
		});
		await this.resetToCommit(remoteCommit, branch);

		const cache = {};
		for (const path of paths) {
			try {
				await git.remove({
					fs: this.fs,
					dir: this.dir,
					filepath: path,
					cache,
				});
			} catch {
				// file may not exist in index
			}
		}

		const sha = await git.commit({
			fs: this.fs,
			dir: this.dir,
			message,
			author: COMMIT_AUTHOR,
			cache,
		});

		await this.pushWithRetry(branch);
		return { sha };
	}

	async getRemoteInfo(): Promise<RemoteInfo> {
		const info = await git.getRemoteInfo({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
		return {
			capabilities: info.capabilities ? [...info.capabilities] : [],
			refs: info.refs?.heads,
		};
	}

	async testConnection(): Promise<ConnectionTestResult> {
		try {
			await git.getRemoteInfo({
				url: this.config.remoteUrl,
				...this.networkOptions(),
			});
			let writeAccess = false;
			try {
				await git.listServerRefs({
					url: this.config.remoteUrl,
					forPush: true,
					...this.networkOptions(),
				});
				writeAccess = true;
			} catch {
				writeAccess = false;
			}
			return { ok: true, readAccess: true, writeAccess };
		} catch (error) {
			return {
				ok: false,
				readAccess: false,
				writeAccess: false,
				error: formatError(error),
			};
		}
	}

	async listBranches(): Promise<BranchInfo[]> {
		const refs = await git.listServerRefs({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
		return refs
			.filter(
				(ref) =>
					ref.ref.startsWith("refs/heads/") && !ref.ref.endsWith("^{}"),
			)
			.map((ref) => {
				const name = ref.ref.replace("refs/heads/", "");
				return {
					name,
					sha: ref.oid,
					isDefault: name === this.config.branch,
				};
			});
	}

	private networkOptions() {
		const onProgress = this.config.onProgress
			? (progress: { phase: string; loaded: number; total?: number }) => {
					this.config.onProgress?.({
						phase: progress.phase,
						loaded: progress.loaded,
						total: progress.total,
					});
				}
			: undefined;
		return {
			http: this.http,
			onAuth: () => this.getAuth(),
			onProgress,
			corsProxy: this.config.corsProxyUrl || undefined,
		};
	}

	private getAuth(): AuthCredentials | undefined {
		const auth = this.config.auth;
		if (auth.type === "bearer" && auth.secret) {
			return { username: "x-access-token", password: auth.secret };
		}
		if (auth.type === "basic" && auth.secret) {
			return { username: auth.username ?? "", password: auth.secret };
		}
		return undefined;
	}

	private async ensureRepoReady(branch: string): Promise<void> {
		if (!this.initialized) {
			const hasRepo = await this.pathExists(`${this.dir}/.git`);
			if (!hasRepo) {
				await git.clone({
					fs: this.fs,
					dir: this.dir,
					url: this.config.remoteUrl,
					ref: branch,
					singleBranch: true,
					depth: 1,
					noCheckout: false,
					...this.networkOptions(),
				});
				this.initialized = true;
				return;
			}
		}

		await git.fetch({
			fs: this.fs,
			dir: this.dir,
			url: this.config.remoteUrl,
			ref: branch,
			singleBranch: true,
			...this.networkOptions(),
		});
		this.initialized = true;
	}

	private async resetToCommit(
		commitOid: string,
		branch: string,
	): Promise<void> {
		await git.checkout({
			fs: this.fs,
			dir: this.dir,
			ref: commitOid,
			force: true,
		});
		await git.branch({
			fs: this.fs,
			dir: this.dir,
			ref: branch,
			object: commitOid,
			force: true,
		});
		await git.checkout({
			fs: this.fs,
			dir: this.dir,
			ref: branch,
		});
	}

	private async pushWithRetry(branch: string): Promise<void> {
		const delays = [1000, 2000, 4000];
		let lastError: unknown;

		for (let attempt = 0; attempt <= delays.length; attempt++) {
			try {
				await git.push({
					fs: this.fs,
					dir: this.dir,
					remote: "origin",
					ref: branch,
					...this.networkOptions(),
				});
				return;
			} catch (error) {
				lastError = error;
				if (attempt < delays.length) {
					await sleep(delays[attempt]!);
				}
			}
		}
		throw lastError;
	}

	private async pathExists(path: string): Promise<boolean> {
		try {
			await this.fs.promises.stat(path);
			return true;
		} catch {
			return false;
		}
	}

	private async ensureParentDir(path: string): Promise<void> {
		const parts = path.split("/");
		if (parts.length <= 1) return;
		let current = this.dir;
		for (let i = 0; i < parts.length - 1; i++) {
			current = `${current}/${parts[i]}`;
			try {
				await this.fs.promises.mkdir(current);
			} catch {
				// directory may already exist
			}
		}
	}

	private toWriteData(file: FileChange): string | Uint8Array {
		if (file.encoding === "base64" && typeof file.content === "string") {
			return Buffer.from(file.content, "base64");
		}
		if (typeof file.content === "string") {
			return file.content;
		}
		return file.content;
	}
}

function buildFsName(remoteUrl: string, branch: string): string {
	let hash = 0;
	const str = remoteUrl + branch;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return `quartz-syncer-${Math.abs(hash).toString(36)}`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
