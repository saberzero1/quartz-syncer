/**
 * A thunk defers reading until the backend is ready to write that one file, so
 * staging a batch costs one path per file instead of its full contents. Media
 * is the reason: a vault's images can exceed available memory if every staged
 * asset is held at once.
 */
export type FileContent =
	| string
	| Uint8Array
	| (() => Promise<string | Uint8Array>);

export interface FileChange {
	path: string;
	content: FileContent;
	encoding?: "utf-8" | "base64";
}

export async function resolveFileContent(
	content: FileContent,
): Promise<string | Uint8Array> {
	return typeof content === "function" ? content() : content;
}

export interface CommitResult {
	sha: string;
	url?: string;
}

/**
 * `removedCount` is how many paths were actually removed, which can be lower
 * than the requested count because an already-absent path is tolerated rather
 * than failed. Callers must report progress from this, not from the request.
 */
export interface DeleteResult extends CommitResult {
	removedCount: number;
}

export interface TreeEntry {
	path: string;
	sha: string;
	type: "blob" | "tree";
	size?: number;
}

export interface RemoteInfo {
	capabilities?: string[];
	refs?: Record<string, string>;
}

export interface ConnectionTestResult {
	ok: boolean;
	readAccess: boolean;
	writeAccess: boolean;
	/** A credential is configured, regardless of whether it works. */
	hasCredential: boolean;
	/**
	 * The credential was actually exercised and accepted. A public repository
	 * answers reads anonymously, so `readAccess` alone says nothing about the
	 * credential — an expired token still yields `readAccess: true`.
	 */
	credentialVerified: boolean;
	error?: string;
}

export interface BranchInfo {
	name: string;
	sha: string;
	isDefault?: boolean;
}

export type ProgressCallback = (progress: {
	phase: string;
	loaded: number;
	total?: number;
}) => void;

export interface GitBackend {
	readTree(ref: string): Promise<TreeEntry[]>;
	readBlob(sha: string): Promise<Uint8Array>;
	/**
	 * Read several blobs in one round trip.
	 *
	 * Optional because a backend may have nothing to amortise; on a partial
	 * clone the difference is one network request instead of one per blob.
	 */
	readBlobs?(shas: string[]): Promise<Uint8Array[]>;
	writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<CommitResult>;
	deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<DeleteResult>;
	getRemoteInfo(): Promise<RemoteInfo>;
	testConnection(): Promise<ConnectionTestResult>;
	listBranches(): Promise<BranchInfo[]>;
}

export interface GitBackendConfig {
	remoteUrl: string;
	branch: string;
	corsProxyUrl?: string;
	/**
	 * Permit an unfiltered clone of a repository large enough to be refused.
	 * Only reachable when the server cannot filter; the transport has no way to
	 * bound the download, so this trades memory safety for access.
	 */
	allowLargeFullClone?: boolean;
	auth: {
		type: "none" | "basic" | "bearer";
		username?: string;
		secret?: string;
	};
	onProgress?: ProgressCallback;
}
