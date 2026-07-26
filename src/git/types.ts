export interface FileChange {
	path: string;
	content: string | Uint8Array;
	encoding?: "utf-8" | "base64";
}

export interface CommitResult {
	sha: string;
	url?: string;
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
	writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<CommitResult>;
	deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<CommitResult>;
	getRemoteInfo(): Promise<RemoteInfo>;
	testConnection(): Promise<ConnectionTestResult>;
	listBranches(): Promise<BranchInfo[]>;
}

export interface GitBackendConfig {
	remoteUrl: string;
	branch: string;
	corsProxyUrl?: string;
	auth: {
		type: "none" | "basic" | "bearer";
		username?: string;
		secret?: string;
	};
	onProgress?: ProgressCallback;
}
