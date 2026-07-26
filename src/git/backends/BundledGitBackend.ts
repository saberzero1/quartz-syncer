import git from "isomorphic-git";
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
import { VaultFsAdapter } from "src/git/backends/VaultFsAdapter";

type AuthCredentials = { username: string; password: string };

export class BundledGitBackend implements GitBackend {
	private config: GitBackendConfig;
	private fs: VaultFsAdapter;
	private http: HttpClient;
	private cache: Record<string, unknown>;
	private dir: string;

	constructor(config: GitBackendConfig, app: App) {
		this.config = config;
		this.dir = buildRepoPath(config.remoteUrl);
		this.fs = new VaultFsAdapter(app, this.dir);
		this.http = new HttpClient();
		this.cache = {};
	}

	async readTree(ref: string): Promise<TreeEntry[]> {
		await this.ensureRepoReady(this.config.branch);
		const commitOid = await git.resolveRef({
			fs: this.fs,
			dir: this.dir,
			ref,
		});
		const { commit } = await git.readCommit({
			fs: this.fs,
			dir: this.dir,
			oid: commitOid,
		});
		const treeOid = commit.tree;
		const entries: TreeEntry[] = [];
		await git.walk({
			fs: this.fs,
			dir: this.dir,
			trees: [git.TREE({ ref: treeOid })],
			map: async (filepath, [entry]) => {
				if (!entry) {
					return undefined;
				}
				if (!filepath || filepath === ".") {
					return undefined;
				}
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
		for (const file of files) {
			await this.ensureParentDir(file.path);
			await this.fs.promises.writeFile(
				file.path,
				this.toWriteData(file),
				this.toWriteOptions(file),
			);
			await git.add({
				fs: this.fs,
				dir: this.dir,
				filepath: file.path,
				cache: this.cache,
			});
		}
		const sha = await git.commit({
			fs: this.fs,
			dir: this.dir,
			message,
			cache: this.cache,
		});
		await git.push({
			fs: this.fs,
			dir: this.dir,
			remote: "origin",
			ref: branch,
			...this.networkOptions(),
		});
		return { sha };
	}

	async deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<CommitResult> {
		await this.ensureRepoReady(branch);
		for (const path of paths) {
			await git.remove({
				fs: this.fs,
				dir: this.dir,
				filepath: path,
				cache: this.cache,
			});
		}
		const sha = await git.commit({
			fs: this.fs,
			dir: this.dir,
			message,
			cache: this.cache,
		});
		await git.push({
			fs: this.fs,
			dir: this.dir,
			remote: "origin",
			ref: branch,
			...this.networkOptions(),
		});
		return { sha };
	}

	async getRemoteInfo(): Promise<RemoteInfo> {
		return git.getRemoteInfo({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
	}

	async testConnection(): Promise<ConnectionTestResult> {
		try {
			await git.getRemoteInfo({
				url: this.config.remoteUrl,
				...this.networkOptions(),
			});
		} catch (error) {
			return {
				ok: false,
				readAccess: false,
				writeAccess: false,
				error: formatError(error),
			};
		}

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

		return {
			ok: true,
			readAccess: true,
			writeAccess,
		};
	}

	async listBranches(): Promise<BranchInfo[]> {
		const refs = await git.listServerRefs({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
		return refs
			.filter((ref) => ref.ref.startsWith("refs/heads/"))
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
		const hasRepo = await this.pathExists(".git");
		if (!hasRepo) {
			await this.fs.promises.mkdir(this.dir, { recursive: true });
			await git.init({
				fs: this.fs,
				dir: this.dir,
				defaultBranch: branch,
			});
			await git.clone({
				fs: this.fs,
				dir: this.dir,
				url: this.config.remoteUrl,
				ref: branch,
				singleBranch: true,
				depth: 1,
				...this.networkOptions(),
			});
			return;
		}

		await git.fetch({
			fs: this.fs,
			dir: this.dir,
			ref: branch,
			singleBranch: true,
			depth: 1,
			...this.networkOptions(),
		});
	}

	private async pathExists(path: string): Promise<boolean> {
		try {
			await this.fs.promises.stat(path);
			return true;
		} catch (error) {
			if ((error as { code?: string }).code === "ENOENT") {
				return false;
			}
			throw error;
		}
	}

	private async ensureParentDir(path: string): Promise<void> {
		const lastSlash = path.lastIndexOf("/");
		if (lastSlash <= 0) {
			return;
		}
		const dir = path.slice(0, lastSlash);
		if (!dir) {
			return;
		}
		await this.fs.promises.mkdir(dir, { recursive: true });
	}

	private toWriteData(file: FileChange): string | Uint8Array {
		if (file.encoding === "base64" && typeof file.content === "string") {
			// eslint-disable-next-line no-undef -- Buffer is available in Node.js and Electron environments
			return new Uint8Array(Buffer.from(file.content, "base64"));
		}
		return file.content;
	}

	private toWriteOptions(
		file: FileChange,
	): { encoding?: string } | undefined {
		if (file.encoding === "base64") {
			return { encoding: "base64" };
		}
		if (file.encoding === "utf-8") {
			return { encoding: "utf8" };
		}
		return undefined;
	}
}

function buildRepoPath(remoteUrl: string): string {
	return `.quartz-syncer/repos/${encodeURIComponent(remoteUrl)}`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
