import type { TreeEntry } from "src/git/types";
import type { PublishFile } from "src/publishFile/PublishFile";
import { PathMapper } from "src/git/PathMapper";
import { DataStore } from "src/cache/DataStore";
import type {
	ArbitraryFileEntry,
	MediaEntry,
	PublishStatus,
} from "src/publisher/types";
import { isMediaFile } from "src/utils/mediaTypes";

export async function categorizeFiles(
	localFiles: PublishFile[],
	remoteTree: TreeEntry[],
	cache: DataStore,
	pathMapper: PathMapper,
	linkedMedia?: Set<string>,
	arbitraryPaths?: string[],
): Promise<PublishStatus> {
	const remoteMap = new Map<string, { sha: string; size?: number }>();
	const remoteFullMap = new Map<string, { sha: string; size?: number }>();

	for (const entry of remoteTree) {
		if (entry.type !== "blob") continue;
		remoteFullMap.set(entry.path, { sha: entry.sha, size: entry.size });
		if (!pathMapper.isInContentFolder(entry.path)) continue;
		remoteMap.set(entry.path, { sha: entry.sha, size: entry.size });
	}

	const localRepoPaths = new Set<string>();
	const unpublished: PublishFile[] = [];
	const changed: PublishFile[] = [];
	const published: PublishFile[] = [];

	for (const file of localFiles) {
		const vaultPath = file.getVaultPath();
		const repoPath = pathMapper.toRepoPath(vaultPath);
		const remote = remoteMap.get(repoPath);
		const localHash = await cache.loadLocalHash(
			file.file.path,
			file.file.stat.mtime,
		);

		localRepoPaths.add(repoPath);

		if (!remote) {
			unpublished.push(file);
			continue;
		}

		if (localHash && localHash === remote.sha) {
			published.push(file);
			continue;
		}

		changed.push(file);
	}

	const deleted: string[] = [];
	const media: MediaEntry[] = [];

	for (const [repoPath, remote] of remoteMap) {
		if (localRepoPaths.has(repoPath)) continue;

		const vaultPath = pathMapper.toVaultPath(repoPath);

		if (isMediaFile(repoPath)) {
			const isLinked = linkedMedia ? linkedMedia.has(vaultPath) : false;

			media.push({
				repoPath,
				vaultPath,
				sha: remote.sha,
				size: remote.size,
				linked: isLinked,
			});
		} else {
			deleted.push(vaultPath);
		}
	}

	const arbitrary: ArbitraryFileEntry[] = [];

	if (arbitraryPaths) {
		for (const path of arbitraryPaths) {
			const remote = remoteFullMap.get(path);
			arbitrary.push({
				vaultPath: path,
				repoPath: path,
				status: remote ? "published" : "unpublished",
				sha: remote?.sha,
			});
		}
	}

	return {
		unpublished,
		changed,
		published,
		deleted,
		media,
		arbitrary,
	};
}
