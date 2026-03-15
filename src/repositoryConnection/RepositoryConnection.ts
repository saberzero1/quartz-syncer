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
					username: "x-access-token",
					password: this.auth.secret || "",
				};
			}

			return {
				username: this.auth.username || "",
				password: this.auth.secret || "",
			};
		};
	}
	/**
	 * Pushes to remote with exponential backoff retry on auth/transient errors.
	 * Retries up to 3 times with delays of 1s, 2s, 4s.
	 */
	private async pushWithRetry(maxRetries: number = 3): Promise<void> {
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				await git.push({
					...this.getGitConfig(),
					url: this.remoteUrl,
					remote: "origin",
					ref: this.branch,
				});
				return;
			} catch (error) {
				const isRetryable =
					error instanceof Error &&
					(error.message.includes("401") ||
						error.message.includes("403") ||
						error.message.includes("429") ||
						error.message.includes("5"));

				if (!isRetryable || attempt === maxRetries) {
					throw error;
				}

				const delay = Math.pow(2, attempt) * 1000;
				logger.warn(
					`Push attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
					error,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	private getGitConfig() {
		const config: {
			fs: LightningFS;
			http: typeof obsidianHttpClient;
			dir: string;
			corsProxy?: string;
			onAuth?: () => { username: string; password: string } | undefined;
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

	/**
	 * Bulk-reads all blob contents from the repository in a single tree walk.
	 * Uses git.walk with TREE walker to avoid per-file HTTP round-trips.
	 * Returns a Map of filepath → decoded UTF-8 content.
	 *
	 * @param filterPrefix - Only include blobs whose path starts with this prefix.
	 * @returns A Map of filepath → content string.
	 */
	async getAllBlobContents(
		filterPrefix?: string,
	): Promise<Map<string, string>> {
		try {
			await this.ensureRepoInitialized();
			const ref = `origin/${this.branch}`;
			const contents = new Map<string, string>();

			await git.walk({
				...this.getGitConfig(),
				trees: [git.TREE({ ref })],
				map: async (filepath, [entry]) => {
					if (!entry) return undefined;
					if (filepath === ".") return undefined;

					// Skip entries outside the filter prefix (but always recurse into directories)
					const type = await entry.type();

					if (type === "tree") {
						// Only recurse into trees that could contain matching paths
						if (
							filterPrefix &&
							!filterPrefix.startsWith(filepath) &&
							!filepath.startsWith(filterPrefix)
						) {
							return undefined; // prune this subtree
						}
						return filepath; // continue recursion
					}

					if (type !== "blob") return undefined;

					// Apply prefix filter
					if (filterPrefix && !filepath.startsWith(filterPrefix)) {
						return undefined;
					}

					const data = await entry.content();
					if (data) {
						const text = new TextDecoder().decode(data);
						contents.set(filepath, text);
					}

					return filepath;
				},
			});

			return contents;
		} catch (error) {
			logger.error("Could not bulk-read blob contents", error);
			throw new Error(
				`Could not bulk-read blob contents from repository ${this.getRepositoryName()}`,
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

	/**
	 * Gets a file from the repository without adding the content folder prefix.
	 * Use this for files outside the content folder (e.g., quartz/styles/custom.scss).
	 */
	async getRawFile(
		path: string,
	): Promise<
		{ content: string; sha: string; path: string; type: "file" } | undefined
	> {
		logger.info(
			`Getting raw file ${path} from repository ${this.getRepositoryName()}`,
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
			logger.error(`Could not get raw file ${path}`, error);
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

	async deleteFiles(
		filePaths: string[],
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<void> {
		if (filePaths.length === 0) return;

		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
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

			// Shared cache avoids re-reading the git index from disk on every git.remove() call.
			// Without this, each call reads + writes the full index = O(n) disk I/O per file.
			const cache = {};

			for (let i = 0; i < filePaths.length; i++) {
				const normalizedPath = normalizeFilePath(filePaths[i]);
				const fullPath = `${this.dir}/${normalizedPath}`;

				try {
					await this.getFs().promises.unlink(fullPath);

					await git.remove({
						...this.getGitConfig(),
						filepath: normalizedPath,
						cache,
					});
				} catch (error) {
					logger.warn(
						`Could not delete file ${normalizedPath}`,
						error,
					);
				}

				if (onProgress) {
					await onProgress(i + 1, filePaths.length);
				}

				// Yield to UI every 50 files
				if (i % 50 === 49) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			await git.commit({
				...this.getGitConfig(),
				message: `Deleted ${filePaths.length} file${filePaths.length === 1 ? "" : "s"}`,
				author: {
					name: "Quartz Syncer",
					email: "quartz-syncer@obsidian.md",
				},
				cache,
			});

			await this.pushWithRetry();
		} catch (error) {
			logger.error("Failed to delete files", error);
			throw error;
		}
	}

	async updateFiles(
		files: CompiledPublishFile[],
		rawFiles?: Map<string, string>,
		rawFilesToDelete?: string[],
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<void> {
		const hasContent = files.length > 0;
		const hasRawFiles = rawFiles && rawFiles.size > 0;

		const hasRawFilesToDelete =
			rawFilesToDelete && rawFilesToDelete.length > 0;

		if (!hasContent && !hasRawFiles && !hasRawFilesToDelete) return;

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

			// Shared cache avoids re-reading the git index from disk on every git.add() call.
			const cache = {};

			// Collect all filepaths to stage in a single batch git.add() call.
			const allFilepathsToStage: string[] = [];
			const totalItems = files.length;
			let completed = 0;

			for (const file of files) {
				const [text, metadata] = file.compiledFile;
				const normalizedPath = normalizeFilePath(file.getPath());
				const fullPath = `${this.dir}/${normalizedPath}`;

				await ensureDirectory(normalizedPath);
				await this.getFs().promises.writeFile(fullPath, text);
				allFilepathsToStage.push(normalizedPath);

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
					allFilepathsToStage.push(assetPath);
				}

				completed++;
				if (onProgress) {
					await onProgress(completed, totalItems);
				}

				// Yield to the browser's rendering pipeline so the progress bar repaints.
				// LightningFS writes are in-memory and complete within microseconds,
				// so without waiting for an animation frame the entire loop can finish
				// within a single frame and the user sees no incremental progress.
				// For large batches, yield every 50 files to avoid capping at 60 files/sec.
				if (totalItems <= 100 || completed % 50 === 0) {
					await new Promise((resolve) =>
						requestAnimationFrame(resolve),
					);
				}
			}

			// Stage all files in a single git.add() call.
			// isomorphic-git's add() accepts an array of filepaths and processes them
			// within a single GitIndexManager.acquire() — one index read + one index write
			// instead of N reads + N writes.
			if (allFilepathsToStage.length > 0) {
				await git.add({
					...this.getGitConfig(),
					filepath: allFilepathsToStage,
					cache,
				});
			}

			if (rawFiles && rawFiles.size > 0) {
				await this.stageRawFiles(rawFiles, cache);
			}

			if (rawFilesToDelete && rawFilesToDelete.length > 0) {
				await this.stageRawFileDeletions(rawFilesToDelete, cache);
			}

			await git.commit({
				...this.getGitConfig(),
				message: `Published ${files.length} file${files.length === 1 ? "" : "s"}`,
				author: {
					name: "Quartz Syncer",
					email: "quartz-syncer@obsidian.md",
				},
				cache,
			});

			await this.pushWithRetry();
		} catch (error) {
			logger.error("Failed to update files", error);
			throw error;
		}
	}

	async stageRawFiles(
		files: Map<string, string>,
		cache: Record<string, unknown> = {},
	): Promise<void> {
		if (files.size === 0) return;

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

		// Write all files to disk first, then batch-stage with a single git.add() call.
		const filepaths: string[] = [];

		for (const [filepath, content] of files) {
			const fullPath = `${this.dir}/${filepath}`;

			await ensureDirectory(filepath);
			await this.getFs().promises.writeFile(fullPath, content);
			filepaths.push(filepath);
		}

		if (filepaths.length > 0) {
			await git.add({
				...this.getGitConfig(),
				filepath: filepaths,
				cache,
			});
		}
	}

	async stageRawFileDeletions(
		filePaths: string[],
		cache: Record<string, unknown> = {},
	): Promise<void> {
		if (filePaths.length === 0) return;

		for (const filepath of filePaths) {
			const fullPath = `${this.dir}/${filepath}`;

			try {
				await this.getFs().promises.unlink(fullPath);

				await git.remove({
					...this.getGitConfig(),
					filepath: filepath,
					cache,
				});
			} catch (error) {
				logger.debug(`Could not delete file ${filepath}`, error);
			}
		}
	}

	async writeRawFiles(files: Map<string, string>): Promise<void> {
		if (files.size === 0) return;

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

			await this.stageRawFiles(files);

			await git.commit({
				...this.getGitConfig(),
				message: "Updated integration styles",
				author: {
					name: "Quartz Syncer",
					email: "quartz-syncer@obsidian.md",
				},
			});

			await this.pushWithRetry();
		} catch (error) {
			logger.error("Failed to write raw files", error);
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
					username: "x-access-token",
					password: auth.secret || "",
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
