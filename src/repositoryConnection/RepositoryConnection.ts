import git, { HttpClient } from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import { normalizePath, requestUrl } from "obsidian";
import Logger from "js-logger";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { GitAuth, GitRemoteSettings } from "src/models/settings";

const logger = Logger.get("repository-connection");

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
			logger.error("HTTP request failed", error);
			throw error;
		}
	},
};

interface IRepositoryConnectionInput {
	gitSettings: GitRemoteSettings;
	contentFolder: string;
	vaultPath: string;
}

interface TreeEntry {
	path: string;
	oid: string;
	type: "blob" | "tree" | "commit";
}

export class RepositoryConnection {
	private remoteUrl: string;
	private branch: string;
	private corsProxyUrl: string | undefined;
	private auth: GitAuth;
	private fs: LightningFS | null = null;
	private dir: string;
	contentFolder: string;
	vaultPath: string;
	private initialized: boolean = false;

	constructor({
		gitSettings,
		contentFolder,
		vaultPath,
	}: IRepositoryConnectionInput) {
		this.remoteUrl = gitSettings.remoteUrl;
		this.branch = gitSettings.branch || "main";
		this.corsProxyUrl = gitSettings.corsProxyUrl || undefined;
		this.auth = gitSettings.auth;
		this.contentFolder = contentFolder;
		this.vaultPath = vaultPath;
		this.dir = "/repo";
	}

	private getFs(): LightningFS {
		if (!this.fs) {
			try {
				const fsName = this.getFsName();
				this.fs = new LightningFS(fsName);
			} catch (error) {
				logger.error("Failed to initialize LightningFS", error);
				throw new Error(
					"Failed to initialize filesystem. IndexedDB may not be available on this platform.",
				);
			}
		}

		return this.fs;
	}

	private getFsName(): string {
		const urlHash = this.hashString(this.remoteUrl + this.branch);

		return `quartz-syncer-${urlHash}`;
	}

	private hashString(str: string): string {
		let hash = 0;

		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}

		return Math.abs(hash).toString(36);
	}

	private getOnAuth() {
		return () => {
			if (this.auth.type === "none") {
				return undefined;
			}

			if (this.auth.type === "bearer") {
				return {
					headers: {
						Authorization: `Bearer ${this.auth.secret}`,
					},
				};
			}

			return {
				username: this.auth.username || "",
				password: this.auth.secret || "",
			};
		};
	}

	private getGitConfig() {
		const config: {
			fs: LightningFS;
			http: typeof obsidianHttpClient;
			dir: string;
			corsProxy?: string;
			onAuth?: () =>
				| { username: string; password: string }
				| { headers: { Authorization: string } }
				| undefined;
		} = {
			fs: this.getFs(),
			http: obsidianHttpClient,
			dir: this.dir,
		};

		if (this.corsProxyUrl) {
			config.corsProxy = this.corsProxyUrl;
		}

		if (this.auth.type !== "none") {
			config.onAuth = this.getOnAuth();
		}

		return config;
	}

	getRepositoryName(): string {
		try {
			const url = new URL(this.remoteUrl);

			return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
		} catch {
			return this.remoteUrl;
		}
	}

	getRepositoryPath(path: string): string {
		const repositoryPath = path.startsWith(this.contentFolder)
			? path.replace(this.contentFolder, "")
			: path;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	getVaultPath(path: string): string {
		path = normalizePath(path);

		const vaultPath = path.startsWith(this.vaultPath)
			? path.replace(this.vaultPath, "")
			: path;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	setRepositoryPath(path: string): string {
		path = normalizePath(path);

		const repositoryPath = path.startsWith(this.contentFolder)
			? path
			: `${this.contentFolder}/${path}`;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	setVaultPath(path: string): string {
		const separator = path.startsWith("/") ? "" : "/";

		const vaultPath = path.startsWith(this.vaultPath)
			? path
			: `${this.vaultPath}${separator}${path}`;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	repositoryToVaultPath(path: string): string {
		return this.setVaultPath(this.getRepositoryPath(path));
	}

	repositoryToRepositoryPath(path: string): string {
		return this.setRepositoryPath(this.getVaultPath(path));
	}

	private async checkExistingRepo(): Promise<boolean> {
		try {
			await this.getFs().promises.stat(this.dir);
			const remotes = await git.listRemotes({ ...this.getGitConfig() });

			return remotes.length > 0;
		} catch {
			return false;
		}
	}

	private async createDirIfNotExists(path: string): Promise<void> {
		try {
			await this.getFs().promises.mkdir(path);
		} catch {
			logger.debug(`Directory ${path} already exists`);
		}
	}

	private async ensureRepoInitialized(): Promise<void> {
		if (this.initialized) {
			return;
		}

		const isExistingRepo = await this.checkExistingRepo();

		if (isExistingRepo) {
			this.initialized = true;

			return;
		}

		logger.info(`Cloning repository ${this.getRepositoryName()}`);

		await this.createDirIfNotExists(this.dir);

		try {
			await git.clone({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
				depth: 1,
				noCheckout: false,
			});
			this.initialized = true;
		} catch (error) {
			logger.error("Failed to clone repository", error);
			throw new Error(
				`Could not clone repository ${this.getRepositoryName()}: ${error}`,
			);
		}
	}

	async getContent(
		_branch?: string,
	): Promise<
		{ tree: TreeEntry[]; sha: string; truncated: boolean } | undefined
	> {
		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
			});

			const commitOid = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			const { commit } = await git.readCommit({
				...this.getGitConfig(),
				oid: commitOid,
			});

			const treeEntries: TreeEntry[] = [];

			const readTreeRecursive = async (
				treeOid: string,
				prefix: string = "",
			) => {
				const { tree } = await git.readTree({
					...this.getGitConfig(),
					oid: treeOid,
				});

				for (const entry of tree) {
					const fullPath = prefix
						? `${prefix}/${entry.path}`
						: entry.path;

					treeEntries.push({
						path: fullPath,
						oid: entry.oid,
						type: entry.type as "blob" | "tree" | "commit",
					});

					if (entry.type === "tree") {
						await readTreeRecursive(entry.oid, fullPath);
					}
				}
			};

			await readTreeRecursive(commit.tree);

			return {
				tree: treeEntries,
				sha: commitOid,
				truncated: false,
			};
		} catch (error) {
			logger.error("Could not get repository content", error);
			throw new Error(
				`Could not get files from repository ${this.getRepositoryName()}`,
			);
		}
	}

	async getFile(
		path: string,
		_branch?: string,
	): Promise<
		{ content: string; sha: string; path: string; type: "file" } | undefined
	> {
		path = this.setRepositoryPath(
			this.getVaultPath(this.getRepositoryPath(path)),
		);

		logger.info(
			`Getting file ${path} from repository ${this.getRepositoryName()}`,
		);

		try {
			await this.ensureRepoInitialized();

			const commitOid = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			const { blob, oid } = await git.readBlob({
				...this.getGitConfig(),
				oid: commitOid,
				filepath: path,
			});

			const content = Buffer.from(blob).toString("base64");

			return {
				content,
				sha: oid,
				path,
				type: "file",
			};
		} catch (error) {
			logger.error(`Could not get file ${path}`, error);
			throw new Error(
				`Could not get file ${path} from repository ${this.getRepositoryName()}`,
			);
		}
	}

	async getLatestCommit(): Promise<
		{ sha: string; commit: { tree: { sha: string } } } | undefined
	> {
		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
				depth: 1,
			});

			const commitOid = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			const { commit } = await git.readCommit({
				...this.getGitConfig(),
				oid: commitOid,
			});

			return {
				sha: commitOid,
				commit: {
					tree: {
						sha: commit.tree,
					},
				},
			};
		} catch (error) {
			logger.error("Could not get latest commit", error);

			return undefined;
		}
	}

	async deleteFiles(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) return;

		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
			});

			const remoteCommit = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			await git.checkout({
				...this.getGitConfig(),
				ref: remoteCommit,
				force: true,
			});

			await git.branch({
				...this.getGitConfig(),
				ref: this.branch,
				object: remoteCommit,
				force: true,
			});

			await git.checkout({
				...this.getGitConfig(),
				ref: this.branch,
			});

			const normalizeFilePath = (path: string): string => {
				let previous;

				do {
					previous = path;
					path = path.replace(/\.\.\//g, "");
				} while (path !== previous);

				path = this.getVaultPath(path);

				return path.startsWith("/")
					? `${this.contentFolder}${path}`
					: `${this.contentFolder}/${path}`;
			};

			for (const filePath of filePaths) {
				const normalizedPath = normalizeFilePath(filePath);
				const fullPath = `${this.dir}/${normalizedPath}`;

				try {
					await this.getFs().promises.unlink(fullPath);

					await git.remove({
						...this.getGitConfig(),
						filepath: normalizedPath,
					});
				} catch (error) {
					logger.warn(
						`Could not delete file ${normalizedPath}`,
						error,
					);
				}
			}

			await git.commit({
				...this.getGitConfig(),
				message: "Deleted multiple files",
				author: {
					name: "Quartz Syncer",
					email: "quartz-syncer@obsidian.md",
				},
			});

			await git.push({
				...this.getGitConfig(),
				url: this.remoteUrl,
				remote: "origin",
				ref: this.branch,
			});
		} catch (error) {
			logger.error("Failed to delete files", error);
			throw error;
		}
	}

	async updateFiles(files: CompiledPublishFile[]): Promise<void> {
		if (files.length === 0) return;

		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
			});

			const remoteCommit = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			await git.checkout({
				...this.getGitConfig(),
				ref: remoteCommit,
				force: true,
			});

			await git.branch({
				...this.getGitConfig(),
				ref: this.branch,
				object: remoteCommit,
				force: true,
			});

			await git.checkout({
				...this.getGitConfig(),
				ref: this.branch,
			});

			const normalizeFilePath = (path: string): string => {
				let previous;

				do {
					previous = path;
					path = path.replace(/\.\.\//g, "");
				} while (path !== previous);

				path = this.getVaultPath(path);

				return path.startsWith("/")
					? `${this.contentFolder}${path}`
					: `${this.contentFolder}/${path}`;
			};

			const ensureDirectory = async (filePath: string): Promise<void> => {
				const parts = filePath.split("/");
				parts.pop();
				let currentPath = this.dir;

				for (const part of parts) {
					if (!part) continue;
					currentPath = `${currentPath}/${part}`;

					try {
						await this.getFs().promises.mkdir(currentPath);
					} catch {
						logger.debug(`Directory ${currentPath} already exists`);
					}
				}
			};

			for (const file of files) {
				const [text, metadata] = file.compiledFile;
				const normalizedPath = normalizeFilePath(file.getPath());
				const fullPath = `${this.dir}/${normalizedPath}`;

				await ensureDirectory(normalizedPath);
				await this.getFs().promises.writeFile(fullPath, text);

				await git.add({
					...this.getGitConfig(),
					filepath: normalizedPath,
				});

				for (const asset of metadata.blobs) {
					const assetPath = normalizeFilePath(asset.path);
					const assetFullPath = `${this.dir}/${assetPath}`;

					await ensureDirectory(assetPath);

					const binaryContent = Uint8Array.from(
						atob(asset.content),
						(c) => c.charCodeAt(0),
					);

					await this.getFs().promises.writeFile(
						assetFullPath,
						binaryContent,
					);

					await git.add({
						...this.getGitConfig(),
						filepath: assetPath,
					});
				}
			}

			await git.commit({
				...this.getGitConfig(),
				message: "Published multiple files",
				author: {
					name: "Quartz Syncer",
					email: "quartz-syncer@obsidian.md",
				},
			});

			await git.push({
				...this.getGitConfig(),
				url: this.remoteUrl,
				remote: "origin",
				ref: this.branch,
			});
		} catch (error) {
			logger.error("Failed to update files", error);
			throw error;
		}
	}

	async testConnection(): Promise<boolean> {
		try {
			await git.getRemoteInfo({
				http: obsidianHttpClient,
				url: this.remoteUrl,
				corsProxy: this.corsProxyUrl,
				onAuth: this.getOnAuth(),
			});

			return true;
		} catch (error) {
			logger.error("Connection test failed", error);

			return false;
		}
	}

	async clearLocalCache(): Promise<void> {
		const fsName = this.getFsName();

		try {
			if (typeof indexedDB !== "undefined") {
				indexedDB.deleteDatabase(fsName);
			}
			this.fs = null;
			this.initialized = false;
			logger.info("Local git cache cleared");
		} catch (error) {
			logger.error("Failed to clear local cache", error);
		}
	}

	static async fetchRemoteBranches(
		remoteUrl: string,
		auth: GitAuth,
		corsProxyUrl?: string,
	): Promise<{ branches: string[]; defaultBranch: string | null }> {
		const getOnAuth = () => {
			if (auth.type === "none") {
				return undefined;
			}

			if (auth.type === "bearer") {
				return () => ({
					headers: {
						Authorization: `Bearer ${auth.secret}`,
					},
				});
			}

			return () => ({
				username: auth.username || "",
				password: auth.secret || "",
			});
		};

		try {
			const refs = await git.listServerRefs({
				http: obsidianHttpClient,
				url: remoteUrl,
				corsProxy: corsProxyUrl,
				onAuth: getOnAuth(),
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
			logger.error("Failed to fetch remote branches", error);

			return { branches: [], defaultBranch: null };
		}
	}
}

export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
