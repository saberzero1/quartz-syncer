import type { FileChange, GitBackend, TreeEntry } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import { RemoteTreeCache } from "src/git/RemoteTreeCache";

export class RemotePublishBackend implements PublishBackend {
	private readonly treeCache: RemoteTreeCache;
	readonly isLocal = false;

	constructor(
		private gitBackend: GitBackend,
		branch: string,
	) {
		this.treeCache = new RemoteTreeCache(gitBackend, branch);
	}

	async writeFiles(
		branch: string,
		message: string,
		files: FileChange[],
	): Promise<{ sha: string }> {
		return this.gitBackend.writeFiles(branch, message, files);
	}

	async deleteFiles(
		branch: string,
		message: string,
		paths: string[],
	): Promise<{ sha: string }> {
		return this.gitBackend.deleteFiles(branch, message, paths);
	}

	async getTree(ref: string): Promise<TreeEntry[]> {
		return this.gitBackend.readTree(ref);
	}

	async readBlob(sha: string): Promise<Uint8Array> {
		return this.gitBackend.readBlob(sha);
	}

	startPeriodicFetch(intervalSeconds: number): void {
		this.treeCache.startPeriodicFetch(intervalSeconds);
	}

	stopPeriodicFetch(): void {
		this.treeCache.stopPeriodicFetch();
	}

	invalidateTreeCache(): void {
		this.treeCache.invalidate();
	}

	async refreshTreeCache(): Promise<TreeEntry[]> {
		return this.treeCache.refresh();
	}

	async getCachedTree(_ref: string): Promise<TreeEntry[]> {
		return this.treeCache.get();
	}
}
