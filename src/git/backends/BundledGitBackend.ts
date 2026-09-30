import git from "@saberzero1/isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import type { App } from "obsidian";
import { HttpClient } from "src/git/HttpClient";
import { buildFsName } from "src/git/backends/GitFsName";
import {
	resolveCloneStrategy,
	type CloneStrategy,
} from "src/git/CloneStrategy";
import { fetchRepositorySize } from "src/git/RepositorySize";
import type {
	DeleteResult,
	BranchInfo,
	CommitResult,
	ConnectionTestResult,
	FileChange,
	GitBackend,
	GitBackendConfig,
	RemoteInfo,
	TreeEntry,
} from "src/git/types";
import { resolveFileContent } from "src/git/types";

type AuthCredentials = { username: string; password: string };

const COMMIT_AUTHOR = {
	name: "Quartz Syncer",
	email: "268450573+quartz-syncer-publisher[bot]@users.noreply.github.com",
};

const MAX_BACKFILL_OBJECTS_PER_REQUEST = 500;

const EMPTY_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

type ChangeNode = {
	files: Map<string, string | null>;
	dirs: Map<string, ChangeNode>;
};

function emptyChangeNode(): ChangeNode {
	return { files: new Map(), dirs: new Map() };
}

export class BundledGitBackend implements GitBackend {
	private config: GitBackendConfig;
	private fs: LightningFS;
	private http: HttpClient;
	private cache: Record<string, unknown>;
	private dir: string;
	private initialized = false;
	private partial = false;

	constructor(config: GitBackendConfig, app: App) {
		this.config = config;
		this.dir = "/repo";

		this.fs = new LightningFS(
			buildFsName(app.appId, config.remoteUrl, config.branch),
		);
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
		return (await this.readBlobs([sha]))[0]!;
	}

	/**
	 * Read blobs, backfilling any the blobless clone omitted.
	 *
	 * Always prefer this over repeated `readBlob` calls: one request serves any
	 * number of oids, so a caller that loops turns a single round trip into one
	 * per blob, against a remote that rate-limits reads.
	 */
	async readBlobs(shas: string[]): Promise<Uint8Array[]> {
		await this.ensureRepoReady(this.config.branch);
		const found = new Map<string, Uint8Array>();
		const missing: string[] = [];

		for (const sha of new Set(shas)) {
			const blob = await this.tryReadBlob(sha);

			if (blob === null) {
				missing.push(sha);
			} else {
				found.set(sha, blob);
			}
		}

		if (missing.length > 0) {
			await this.backfill(missing);

			for (const sha of missing) {
				const { blob } = await git.readBlob({
					fs: this.fs,
					dir: this.dir,
					oid: sha,
				});
				found.set(sha, blob);
			}
		}

		return shas.map((sha) => found.get(sha)!);
	}

	private async tryReadBlob(oid: string): Promise<Uint8Array | null> {
		try {
			const { blob } = await git.readBlob({
				fs: this.fs,
				dir: this.dir,
				oid,
			});

			return blob;
		} catch (error) {
			// Anything other than absence is real damage and must not be
			// papered over by re-downloading.
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === git.Errors.NotFoundError.code
			) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Fetch omitted blobs on demand.
	 *
	 * Only reached for objects the caller already resolved from the remote tree,
	 * so an absent one is a filtered-out blob rather than damage.
	 *
	 * The ceiling bounds a single request rather than the session: asking for
	 * thousands of blobs at once is the "pull the whole repository back down"
	 * mistake worth refusing, while a long session that legitimately reads many
	 * files one at a time is not.
	 */
	private async backfill(oids: string[]): Promise<void> {
		if (!this.partial) {
			throw new Error(
				`Object ${oids[0]} is missing from a complete clone. The local repository cache may be damaged; clear the plugin cache to re-clone.`,
			);
		}

		if (oids.length > MAX_BACKFILL_OBJECTS_PER_REQUEST) {
			throw new Error(
				`Refusing to fetch ${oids.length} omitted objects in one request (limit ${MAX_BACKFILL_OBJECTS_PER_REQUEST}). This usually means something is reading the whole repository rather than the files it needs.`,
			);
		}

		await git.fetchObjects({
			fs: this.fs,
			http: this.http,
			dir: this.dir,
			oids,
			onAuth: () => this.getAuth(),
			corsProxy: this.config.corsProxyUrl || undefined,
		});
	}

	async writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<CommitResult> {
		await this.ensureRepoReady(branch);

		const changes = new Map<string, string | null>();

		for (const file of files) {
			changes.set(
				file.path,
				await git.writeBlob({
					fs: this.fs,
					dir: this.dir,
					blob: await this.toBlob(file),
				}),
			);
		}

		const sha = await this.commitChanges(branch, message, changes);

		if (sha === null) return { sha: "" };

		await this.pushWithRetry(branch);

		return { sha };
	}

	async deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<DeleteResult> {
		if (paths.length === 0) return { sha: "", removedCount: 0 };
		await this.ensureRepoReady(branch);

		// Absence must be detected before committing: deleting nothing and
		// committing anyway produces an empty commit and reports progress for
		// work that never happened.
		const present = new Set(
			(await this.readTree(branch))
				.filter((entry) => entry.type === "blob")
				.map((entry) => entry.path),
		);

		const changes = new Map<string, string | null>();
		// Counts requested paths that matched, not the files they expanded to:
		// callers drive progress from this against the list they supplied.
		let removedCount = 0;

		for (const path of paths) {
			if (present.has(path)) {
				changes.set(path, null);
				removedCount += 1;
				continue;
			}

			let matched = false;

			for (const candidate of present) {
				if (candidate.startsWith(`${path}/`)) {
					changes.set(candidate, null);
					matched = true;
				}
			}

			if (matched) removedCount += 1;
		}

		if (removedCount === 0) return { sha: "", removedCount: 0 };

		const sha = await this.commitChanges(branch, message, changes);

		if (sha === null) return { sha: "", removedCount: 0 };

		await this.pushWithRetry(branch);

		return { sha, removedCount };
	}

	/**
	 * Commit path changes by writing objects, never a working tree.
	 *
	 * A checkout would materialize every file in the repository, which on a
	 * blobless clone means fetching back all the content the filter omitted.
	 * Building the tree directly touches only the directories on the path to a
	 * change; every other entry is carried over by oid.
	 *
	 * @returns The new commit sha, or null when the tree is unchanged.
	 */
	private async commitChanges(
		branch: string,
		message: string,
		changes: Map<string, string | null>,
	): Promise<string | null> {
		const remoteCommit = await git.resolveRef({
			fs: this.fs,
			dir: this.dir,
			ref: `origin/${branch}`,
		});
		const { commit } = await git.readCommit({
			fs: this.fs,
			dir: this.dir,
			oid: remoteCommit,
		});

		const root = emptyChangeNode();

		for (const [path, oid] of changes) {
			const segments = path.split("/").filter(Boolean);
			const name = segments.pop();
			if (name === undefined) continue;

			let node = root;

			for (const segment of segments) {
				let child = node.dirs.get(segment);

				if (!child) {
					child = emptyChangeNode();
					node.dirs.set(segment, child);
				}
				node = child;
			}
			node.files.set(name, oid);
		}

		const tree = await this.writeTreeWithChanges(commit.tree, root);

		if (tree === commit.tree) return null;

		const now = Math.floor(Date.now() / 1000);

		const sha = await git.writeCommit({
			fs: this.fs,
			dir: this.dir,
			commit: {
				tree: tree ?? EMPTY_TREE_OID,
				parent: [remoteCommit],
				author: { ...COMMIT_AUTHOR, timestamp: now, timezoneOffset: 0 },
				committer: {
					...COMMIT_AUTHOR,
					timestamp: now,
					timezoneOffset: 0,
				},
				message: message.endsWith("\n") ? message : `${message}\n`,
			},
		});

		await git.writeRef({
			fs: this.fs,
			dir: this.dir,
			ref: `refs/heads/${branch}`,
			value: sha,
			force: true,
		});

		return sha;
	}

	/**
	 * @returns The new tree oid, or null when the directory became empty —
	 * git has no empty directories, so the parent must drop the entry.
	 */
	private async writeTreeWithChanges(
		baseOid: string | null,
		node: ChangeNode,
	): Promise<string | null> {
		const base = baseOid
			? await git.readTree({ fs: this.fs, dir: this.dir, oid: baseOid })
			: { tree: [] };

		const entries = new Map(base.tree.map((entry) => [entry.path, entry]));

		for (const [name, oid] of node.files) {
			if (oid === null) {
				entries.delete(name);
				continue;
			}

			entries.set(name, {
				// Reuse the existing mode so an executable bit or a symlink is
				// not silently rewritten into a plain file on republish.
				mode: entries.get(name)?.mode ?? "100644",
				path: name,
				oid,
				type: "blob",
			});
		}

		for (const [name, child] of node.dirs) {
			const existing = entries.get(name);

			const childOid = await this.writeTreeWithChanges(
				existing?.type === "tree" ? existing.oid : null,
				child,
			);

			if (childOid === null) {
				entries.delete(name);
				continue;
			}

			entries.set(name, {
				mode: "040000",
				path: name,
				oid: childOid,
				type: "tree",
			});
		}

		if (entries.size === 0) return null;

		return git.writeTree({
			fs: this.fs,
			dir: this.dir,
			tree: [...entries.values()],
		});
	}

	async getRemoteInfo(): Promise<RemoteInfo> {
		const info = await git.getRemoteInfo({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
		const refs = info.refs as
			| { heads?: Record<string, string> }
			| undefined;
		return {
			capabilities: info.capabilities ? [...info.capabilities] : [],
			refs: refs?.heads,
		};
	}

	async testConnection(): Promise<ConnectionTestResult> {
		const hasCredential = this.getAuth() !== undefined;

		// isomorphic-git only calls onAuth when the server issues a challenge.
		// A public repository serves reads anonymously, so the credential is
		// never touched and a successful read cannot vouch for it.
		let readUsedCredential = false;

		try {
			await git.getRemoteInfo({
				url: this.config.remoteUrl,
				...this.networkOptions(),
				onAuth: () => {
					readUsedCredential = true;
					return this.getAuth();
				},
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

			return {
				ok: true,
				readAccess: true,
				writeAccess,
				hasCredential,
				// A push probe always authenticates, so reaching it proves the
				// credential. Otherwise only a challenged read does.
				credentialVerified: writeAccess || readUsedCredential,
			};
		} catch (error) {
			return {
				ok: false,
				readAccess: false,
				writeAccess: false,
				hasCredential,
				credentialVerified: false,
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
					ref.ref.startsWith("refs/heads/") &&
					!ref.ref.endsWith("^{}"),
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

	async hasCommitInHistory(
		targetSha: string,
		depth: number = 100,
	): Promise<boolean> {
		try {
			await this.ensureRepoReady(this.config.branch);

			await git.fetch({
				fs: this.fs,
				dir: this.dir,
				url: this.config.remoteUrl,
				ref: this.config.branch,
				singleBranch: true,
				depth,
				...this.networkOptions(),
			});

			const commits = await git.log({
				fs: this.fs,
				dir: this.dir,
				ref: `origin/${this.config.branch}`,
				depth,
			});

			return commits.some((entry) => entry.oid === targetSha);
		} catch {
			return false;
		}
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
				const strategy = await this.resolveStrategy();

				if (strategy.kind === "refuse") {
					throw new Error(strategy.reason);
				}

				if (strategy.kind === "full") {
					await git.clone({
						fs: this.fs,
						dir: this.dir,
						url: this.config.remoteUrl,
						ref: branch,
						singleBranch: true,
						depth: 1,
						noCheckout: true,
						...this.networkOptions(),
					});
					this.partial = false;
					this.initialized = true;

					return;
				}

				// Nothing ever needs a working tree: reads go through
				// readTree/readBlobs and writes build trees object-by-object.
				//
				// `noCheckout` alone still downloads every blob at HEAD, which
				// on a media-heavy repository is gigabytes fetched to answer a
				// question the tree objects already answer. `blob:none` omits
				// them; readBlobs() fetches back only what is actually read.
				await git.clone({
					fs: this.fs,
					dir: this.dir,
					url: this.config.remoteUrl,
					ref: branch,
					singleBranch: true,
					noCheckout: true,
					// No `depth`: commits and trees are small once blobs are
					// filtered out, and a shallow history truncates the
					// merge-base that push relies on to know which objects the
					// remote already has.
					filter: "blob:none",
					...this.networkOptions(),
				});
				this.partial = true;
				this.initialized = true;

				return;
			}
			this.partial = await this.hasPromisorPack();
		}

		await git.fetch({
			fs: this.fs,
			dir: this.dir,
			url: this.config.remoteUrl,
			ref: branch,
			singleBranch: true,
			// Must match the clone: an unfiltered fetch against a partial clone
			// re-downloads every blob it previously omitted.
			...(this.partial ? { filter: "blob:none" } : {}),
			...this.networkOptions(),
		});
		this.initialized = true;
	}

	/**
	 * Servers that cannot filter still have to be handled, and the only safe
	 * unfiltered clone is one small enough to buffer whole.
	 */
	private async resolveStrategy(): Promise<CloneStrategy> {
		// Deliberately not caught: a connection failure here is the same
		// failure the clone would hit, and swallowing it would fall through to
		// the unbounded full clone this check exists to prevent.
		const info = await git.getRemoteInfo({
			url: this.config.remoteUrl,
			...this.networkOptions(),
		});
		const capabilities = info.capabilities ? [...info.capabilities] : [];

		// Only pay for the size lookup when it can change the answer.
		if (capabilities.includes("filter")) {
			return resolveCloneStrategy(capabilities, null);
		}

		return resolveCloneStrategy(
			capabilities,
			await fetchRepositorySize(
				this.config.remoteUrl,
				this.http,
				this.getAuth()?.password,
			),
			{ allowLargeFullClone: this.config.allowLargeFullClone },
		);
	}

	private async hasPromisorPack(): Promise<boolean> {
		try {
			const names = await this.fs.promises.readdir(
				`${this.dir}/.git/objects/pack`,
			);

			return names.some((name) => name.endsWith(".promisor"));
		} catch {
			return false;
		}
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

	private async toBlob(file: FileChange): Promise<Uint8Array> {
		const content = await resolveFileContent(file.content);

		if (content instanceof Uint8Array) return content;

		if (file.encoding === "base64") {
			return Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
		}

		return new TextEncoder().encode(content);
	}

	private async pathExists(path: string): Promise<boolean> {
		try {
			await this.fs.promises.stat(path);
			return true;
		} catch {
			return false;
		}
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
