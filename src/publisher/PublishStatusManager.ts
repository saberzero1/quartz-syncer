import type { TreeEntry } from "src/git/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import { PathMapper } from "src/git/PathMapper";
import { DataStore } from "src/cache/DataStore";
import type { PublishStatus } from "src/publisher/types";

export async function categorizeFiles(
	localFiles: PublishFile[],
	remoteTree: TreeEntry[],
	cache: DataStore,
	pathMapper: PathMapper,
): Promise<PublishStatus> {
	const remoteMap = new Map<string, string>();

	for (const entry of remoteTree) {
		if (entry.type !== "blob") continue;
		if (!pathMapper.isInContentFolder(entry.path)) continue;
		remoteMap.set(entry.path, entry.sha);
	}

	const localRepoPaths = new Set<string>();
	const unpublished: PublishFile[] = [];
	const changed: PublishFile[] = [];
	const published: PublishFile[] = [];

	for (const file of localFiles) {
		const vaultPath = file.getVaultPath();
		const repoPath = pathMapper.toRepoPath(vaultPath);
		const remoteSha = remoteMap.get(repoPath);
		const localHash = await cache.loadLocalHash(
			file.file.path,
			file.file.stat.mtime,
		);

		localRepoPaths.add(repoPath);

		if (!remoteSha) {
			unpublished.push(file);
			continue;
		}

		if (localHash && localHash === remoteSha) {
			published.push(file);
			continue;
		}

		changed.push(file);
	}

	const deleted: string[] = [];

	for (const [repoPath] of remoteMap) {
		if (!localRepoPaths.has(repoPath)) {
			deleted.push(pathMapper.toVaultPath(repoPath));
		}
	}

	return {
		unpublished,
		changed,
		published,
		deleted,
	};
}
