import git, { HttpClient } from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import { normalizePath, requestUrl } from "obsidian";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { GitAuth, GitRemoteSettings } from "src/models/settings";
import { removeLeadingSlash } from "src/utils/utils";
import {
	isPreflightExempt,
	isUserOwnedPath,
	USER_OWNED_FILES,
} from "./fileOwnership";

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
	private static readonly COMMIT_AUTHOR = {
		name: "Quartz Syncer",
		email: "268450573+quartz-syncer-publisher[bot]@users.noreply.github.com",
	} as const;

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
				console.error("Failed to initialize LightningFS", error);
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

				console.debug(
					`Push attempt ${
						attempt + 1
					} failed, retrying in ${delay}ms...`,
					error,
				);

				await new Promise((resolve) =>
					window.setTimeout(resolve, delay),
				);
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

		return removeLeadingSlash(repositoryPath);
	}

	getVaultPath(path: string): string {
		path = normalizePath(path);

		const vaultPath = path.startsWith(this.vaultPath)
			? path.replace(this.vaultPath, "")
			: path;

		return removeLeadingSlash(vaultPath);
	}

	setRepositoryPath(path: string): string {
		path = normalizePath(path);

		const repositoryPath = path.startsWith(this.contentFolder)
			? path
			: `${this.contentFolder}/${path}`;

		return removeLeadingSlash(repositoryPath);
	}

	setVaultPath(path: string): string {
		const separator = path.startsWith("/") ? "" : "/";

		const vaultPath = path.startsWith(this.vaultPath)
			? path
			: `${this.vaultPath}${separator}${path}`;

		return removeLeadingSlash(vaultPath);
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
			console.debug(`Directory ${path} already exists`);
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

		console.debug(`Cloning repository ${this.getRepositoryName()}`);

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
			console.error("Failed to clone repository", error);
			throw new Error(
				`Could not clone repository ${this.getRepositoryName()}: ${String(
					error,
				)}`,
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
						type: entry.type,
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
			console.error("Could not get repository content", error);
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
			console.error("Could not bulk-read blob contents", error);
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

		console.debug(
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

			/* eslint-disable-next-line no-undef -- Buffer polyfill available at runtime */
			const content = Buffer.from(blob).toString("base64");

			return {
				content,
				sha: oid,
				path,
				type: "file",
			};
		} catch (error) {
			console.error(`Could not get file ${path}`, error);
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
		console.debug(
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

			/* eslint-disable-next-line no-undef -- Buffer polyfill available at runtime */
			const content = Buffer.from(blob).toString("base64");

			return {
				content,
				sha: oid,
				path,
				type: "file",
			};
		} catch (error) {
			console.error(`Could not get raw file ${path}`, error);
			throw new Error(
				`Could not get file ${path} from repository ${this.getRepositoryName()}`,
			);
		}
	}

	/**
	 * Lists file and directory names in a specific directory path within the repository.
	 * Only lists immediate children (non-recursive).
	 *
	 * @param dirPath - The directory path to list (e.g. "quartz/cli/templates").
	 * @returns An array of entry names, or an empty array if the directory doesn't exist.
	 */
	async listDirectory(
		dirPath: string,
	): Promise<{ name: string; type: "blob" | "tree" }[]> {
		try {
			await this.ensureRepoInitialized();

			const commitOid = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			const { commit } = await git.readCommit({
				...this.getGitConfig(),
				oid: commitOid,
			});

			let currentOid = commit.tree;
			const parts = dirPath.split("/").filter((p) => p.length > 0);

			for (const part of parts) {
				const { tree } = await git.readTree({
					...this.getGitConfig(),
					oid: currentOid,
				});

				const entry = tree.find(
					(e) => e.path === part && e.type === "tree",
				);

				if (!entry) return [];

				currentOid = entry.oid;
			}

			const { tree } = await git.readTree({
				...this.getGitConfig(),
				oid: currentOid,
			});

			return tree.map((e) => ({
				name: e.path,
				type: e.type as "blob" | "tree",
			}));
		} catch (error) {
			console.debug(`Could not list directory ${dirPath}`, error);

			return [];
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
			console.error("Could not get latest commit", error);

			return undefined;
		}
	}

	async hasCommitInHistory(
		targetOid: string,
		fetchDepth: number = 100,
	): Promise<boolean> {
		try {
			await this.ensureRepoInitialized();

			await git.fetch({
				...this.getGitConfig(),
				url: this.remoteUrl,
				ref: this.branch,
				singleBranch: true,
				depth: fetchDepth,
			});

			const commits = await git.log({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
				depth: fetchDepth,
			});

			return commits.some((entry) => entry.oid === targetOid);
		} catch {
			return false;
		}
	}

	private async detectFrameworkModifications(
		oursOid: string,
		baseOid: string,
	): Promise<string[]> {
		const modified: string[] = [];

		await git.walk({
			...this.getGitConfig(),
			trees: [git.TREE({ ref: oursOid }), git.TREE({ ref: baseOid })],
			map: async (filepath, [ours, base]) => {
				if (filepath === ".") return undefined;

				const oursType = ours ? await ours.type() : undefined;
				const baseType = base ? await base.type() : undefined;

				if (oursType === "tree" || baseType === "tree") return filepath;

				if (isPreflightExempt(filepath)) return undefined;

				const oursOidVal = ours ? await ours.oid() : undefined;
				const baseOidVal = base ? await base.oid() : undefined;

				if (oursOidVal !== baseOidVal) {
					modified.push(filepath);
				}

				return undefined;
			},
		});

		return modified;
	}

	private async snapshotUserOwnedFiles(
		commitOid: string,
	): Promise<Map<string, Uint8Array>> {
		const snapshots = new Map<string, Uint8Array>();

		for (const filepath of USER_OWNED_FILES) {
			try {
				const { blob } = await git.readBlob({
					...this.getGitConfig(),
					oid: commitOid,
					filepath,
				});
				snapshots.set(filepath, blob);
			} catch {
				// File doesn't exist in this commit — skip
			}
		}

		return snapshots;
	}

	private async restoreUserOwnedFiles(
		snapshots: Map<string, Uint8Array>,
	): Promise<boolean> {
		let restored = false;

		for (const [filepath, blob] of snapshots) {
			const fullPath = `${this.dir}/${filepath}`;

			try {
				const current = await this.getFs().promises.readFile(fullPath);

				if (
					current.length === blob.length &&
					current.every((byte: number, i: number) => byte === blob[i])
				) {
					continue;
				}
			} catch {
				/* file missing after merge */
			}

			await this.ensureDirectory(filepath);
			await this.getFs().promises.writeFile(fullPath, blob);

			await git.add({
				...this.getGitConfig(),
				filepath,
			});

			restored = true;
		}

		return restored;
	}

	private createUpgradeMergeDriver(): {
		driver: (args: {
			branches: string[];
			contents: string[];
			path: string;
		}) => Promise<{ cleanMerge: boolean; mergedText: string }>;
		resolutions: Map<string, "ours" | "theirs">;
	} {
		const resolutions = new Map<string, "ours" | "theirs">();

		const driver = async ({
			contents,
			path,
		}: {
			branches: string[];
			contents: string[];
			path: string;
		}) => {
			const [_base, ours, theirs] = contents;

			if (isUserOwnedPath(path)) {
				resolutions.set(path, "ours");

				console.debug(
					`Auto-resolved conflict in ${path}: keeping ours`,
				);

				return { cleanMerge: true, mergedText: ours ?? "" };
			}

			resolutions.set(path, "theirs");

			console.debug(
				`Auto-resolved conflict in ${path}: accepting theirs`,
			);

			return { cleanMerge: true, mergedText: theirs ?? "" };
		};

		return { driver, resolutions };
	}

	async upgradeFromUpstream(
		upstreamUrl: string,
		upstreamBranch: string,
	): Promise<{ oid: string; alreadyMerged: boolean }> {
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

		await this.resetToRemoteCommit(remoteCommit);

		const remoteName = "upstream";

		const existingRemotes = await git.listRemotes({
			...this.getGitConfig(),
		});

		if (existingRemotes.some((r) => r.remote === remoteName)) {
			await git.deleteRemote({
				...this.getGitConfig(),
				remote: remoteName,
			});
		}

		await git.addRemote({
			...this.getGitConfig(),
			remote: remoteName,
			url: upstreamUrl,
		});

		await git.fetch({
			...this.getGitConfig(),
			url: upstreamUrl,
			remote: remoteName,
			ref: upstreamBranch,
			singleBranch: true,
		});

		const mergeRef = `remotes/${remoteName}/${upstreamBranch}`;
		const mergeAuthor = RepositoryConnection.COMMIT_AUTHOR;

		const oursOid = await git.resolveRef({
			...this.getGitConfig(),
			ref: this.branch,
		});

		const theirsOid = await git.resolveRef({
			...this.getGitConfig(),
			ref: mergeRef,
		});

		// Phase 1: Preflight — detect framework modifications
		const mergeBaseOids: string[] = (await git.findMergeBase({
			...this.getGitConfig(),
			oids: [oursOid, theirsOid],
		})) as string[];

		if (mergeBaseOids.length === 0) {
			throw new Error(
				"Cannot determine merge base between your repository and upstream. " +
					"Run `npx quartz upgrade` manually.",
			);
		}

		const baseOid = mergeBaseOids[0];

		const frameworkMods = await this.detectFrameworkModifications(
			oursOid,
			baseOid,
		);

		if (frameworkMods.length > 0) {
			const fileList = frameworkMods.map((f) => `  - ${f}`).join("\n");
			throw new Error(
				`Cannot auto-upgrade: you have modified framework files that would ` +
					`conflict with upstream changes:\n${fileList}\n` +
					`Run \`npx quartz upgrade\` manually to resolve these conflicts.`,
			);
		}

		// Phase 2: Snapshot + Merge
		const snapshots = await this.snapshotUserOwnedFiles(oursOid);

		const { driver: mergeDriver, resolutions } =
			this.createUpgradeMergeDriver();

		let result: {
			oid?: string;
			alreadyMerged?: boolean;
		};

		try {
			result = await git.merge({
				...this.getGitConfig(),
				ours: this.branch,
				theirs: mergeRef,
				abortOnConflict: false,
				mergeDriver,
				author: mergeAuthor,
			});
		} catch (mergeError) {
			const conflictFiles = this.extractConflictFiles(mergeError);

			if (!conflictFiles) throw mergeError;

			await this.restoreUserOwnedFiles(snapshots);

			const commitOid = await git.commit({
				...this.getGitConfig(),
				message: `Merge upstream/${upstreamBranch} (auto-resolved conflicts)`,
				author: mergeAuthor,
				parent: [oursOid, theirsOid],
			});

			result = { oid: commitOid, alreadyMerged: false };

			if (resolutions.size > 0) {
				console.debug(
					`Auto-resolved ${resolutions.size} conflict(s):`,
					Object.fromEntries(resolutions),
				);
			}

			await git.checkout({
				...this.getGitConfig(),
				ref: this.branch,
			});

			await this.pushWithRetry();

			return {
				oid: result.oid!,
				alreadyMerged: false,
			};
		}

		if (result.alreadyMerged) {
			return {
				oid: result.oid ?? remoteCommit,
				alreadyMerged: true,
			};
		}

		// Phase 3: Post-merge restore — even on clean merge, restore user files
		// in case upstream cleanly modified them
		const filesRestored = await this.restoreUserOwnedFiles(snapshots);

		let finalOid = result.oid!;

		if (filesRestored) {
			finalOid = await git.commit({
				...this.getGitConfig(),
				message: `Merge upstream/${upstreamBranch}`,
				author: mergeAuthor,
				parent: [oursOid, theirsOid],
			});
		}

		if (resolutions.size > 0) {
			console.debug(
				`Auto-resolved ${resolutions.size} conflict(s):`,
				Object.fromEntries(resolutions),
			);
		}

		await git.checkout({
			...this.getGitConfig(),
			ref: this.branch,
		});

		await this.pushWithRetry();

		return {
			oid: finalOid,
			alreadyMerged: false,
		};
	}

	private extractConflictFiles(error: unknown): string[] | null {
		if (
			error &&
			typeof error === "object" &&
			"data" in error &&
			error.data &&
			typeof error.data === "object" &&
			"filepaths" in error.data &&
			Array.isArray(error.data.filepaths)
		) {
			return error.data.filepaths as string[];
		}

		return null;
	}

	private normalizeFilePath(path: string): string {
		let previous;

		do {
			previous = path;
			path = path.replace(/\.\.\//g, "");
		} while (path !== previous);

		path = this.getVaultPath(path);

		return path.startsWith("/")
			? `${this.contentFolder}${path}`
			: `${this.contentFolder}/${path}`;
	}

	private async ensureDirectory(filePath: string): Promise<void> {
		const parts = filePath.split("/");
		parts.pop();
		let currentPath = this.dir;

		for (const part of parts) {
			if (!part) continue;
			currentPath = `${currentPath}/${part}`;

			try {
				await this.getFs().promises.mkdir(currentPath);
			} catch {
				console.debug(`Directory ${currentPath} already exists`);
			}
		}
	}

	private async resetToRemoteCommit(remoteCommit: string): Promise<void> {
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

			const remoteCommit = await git.resolveRef({
				...this.getGitConfig(),
				ref: `origin/${this.branch}`,
			});

			await this.resetToRemoteCommit(remoteCommit);

			// Shared cache avoids re-reading the git index from disk on every git.remove() call.
			// Without this, each call reads + writes the full index = O(n) disk I/O per file.
			const cache = {};

			for (let i = 0; i < filePaths.length; i++) {
				const normalizedPath = this.normalizeFilePath(filePaths[i]);
				const fullPath = `${this.dir}/${normalizedPath}`;

				try {
					await this.getFs().promises.unlink(fullPath);

					await git.remove({
						...this.getGitConfig(),
						filepath: normalizedPath,
						cache,
					});
				} catch (error) {
					console.debug(
						`Could not delete file ${normalizedPath}`,
						error,
					);
				}

				if (onProgress) {
					await onProgress(i + 1, filePaths.length);
				}

				// Yield to UI every 50 files
				if (i % 50 === 49) {
					await new Promise((resolve) =>
						window.setTimeout(resolve, 0),
					);
				}
			}

			await git.commit({
				...this.getGitConfig(),
				message: `Deleted ${filePaths.length} file${
					filePaths.length === 1 ? "" : "s"
				}`,
				author: RepositoryConnection.COMMIT_AUTHOR,
				cache,
			});

			await this.pushWithRetry();
		} catch (error) {
			console.error("Failed to delete files", error);
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

			await this.resetToRemoteCommit(remoteCommit);

			// Shared cache avoids re-reading the git index from disk on every git.add() call.
			const cache = {};

			// Collect all filepaths to stage in a single batch git.add() call.
			const allFilepathsToStage: string[] = [];
			const totalItems = files.length;
			let completed = 0;

			for (const file of files) {
				const [text, metadata] = file.compiledFile;
				const normalizedPath = this.normalizeFilePath(file.getPath());
				const fullPath = `${this.dir}/${normalizedPath}`;

				await this.ensureDirectory(normalizedPath);
				await this.getFs().promises.writeFile(fullPath, text);
				allFilepathsToStage.push(normalizedPath);

				for (const asset of metadata.blobs) {
					const assetPath = this.normalizeFilePath(asset.path);
					const assetFullPath = `${this.dir}/${assetPath}`;

					await this.ensureDirectory(assetPath);

					/* eslint-disable-next-line no-undef -- Buffer polyfill available at runtime */
					const binaryContent = Buffer.from(asset.content, "base64");

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
						window.requestAnimationFrame(resolve),
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
				message: `Published ${files.length} file${
					files.length === 1 ? "" : "s"
				}`,
				author: RepositoryConnection.COMMIT_AUTHOR,
				cache,
			});

			await this.pushWithRetry();
		} catch (error) {
			console.error("Failed to update files", error);
			throw error;
		}
	}

	async stageRawFiles(
		files: Map<string, string>,
		cache: Record<string, unknown> = {},
	): Promise<void> {
		if (files.size === 0) return;

		// Write all files to disk first, then batch-stage with a single git.add() call.
		const filepaths: string[] = [];

		for (const [filepath, content] of files) {
			const fullPath = `${this.dir}/${filepath}`;

			await this.ensureDirectory(filepath);
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
				console.debug(`Could not delete file ${filepath}`, error);
			}
		}
	}

	async writeRawFiles(
		files: Map<string, string>,
		commitMessage = "Updated integration styles",
	): Promise<void> {
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

			await this.resetToRemoteCommit(remoteCommit);

			await this.stageRawFiles(files);

			await git.commit({
				...this.getGitConfig(),
				message: commitMessage,
				author: RepositoryConnection.COMMIT_AUTHOR,
			});

			await this.pushWithRetry();
		} catch (error) {
			console.error("Failed to write raw files", error);
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
			console.error("Connection test failed", error);

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
			console.debug("Local git cache cleared");
		} catch (error) {
			console.error("Failed to clear local cache", error);
		}
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

export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
