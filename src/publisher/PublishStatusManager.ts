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

export interface RemoteIndex {
	content: Map<string, { sha: string; size?: number }>;
	full: Map<string, { sha: string; size?: number }>;
}

export function buildRemoteIndex(
	remoteTree: TreeEntry[],
	pathMapper: PathMapper,
): RemoteIndex {
	const content = new Map<string, { sha: string; size?: number }>();
	const full = new Map<string, { sha: string; size?: number }>();

	for (const entry of remoteTree) {
		if (entry.type !== "blob") continue;
		full.set(entry.path, { sha: entry.sha, size: entry.size });
		if (!pathMapper.isInContentFolder(entry.path)) continue;
		content.set(entry.path, { sha: entry.sha, size: entry.size });
	}

	return { content, full };
}

export function classifyRemoteOnly(
	remoteIndex: RemoteIndex,
	localFiles: PublishFile[],
	pathMapper: PathMapper,
	linkedMedia?: Set<string>,
): { deleted: string[]; media: MediaEntry[] } {
	const localRepoPaths = new Set<string>();

	for (const file of localFiles) {
		localRepoPaths.add(pathMapper.toRepoPath(file.getVaultPath()));
	}

	const deleted: string[] = [];
	const media: MediaEntry[] = [];

	for (const [repoPath, remote] of remoteIndex.content) {
		if (localRepoPaths.has(repoPath)) continue;

		const vaultPath = pathMapper.toVaultPath(repoPath);

		if (isMediaFile(repoPath)) {
			media.push({
				repoPath,
				vaultPath,
				sha: remote.sha,
				size: remote.size,
				linked: linkedMedia ? linkedMedia.has(vaultPath) : false,
			});
		} else {
			deleted.push(vaultPath);
		}
	}

	return { deleted, media };
}

export function classifyArbitrary(
	remoteIndex: RemoteIndex,
	arbitraryPaths?: string[],
): ArbitraryFileEntry[] {
	const arbitrary: ArbitraryFileEntry[] = [];

	if (arbitraryPaths) {
		for (const path of arbitraryPaths) {
			const remote = remoteIndex.full.get(path);
			arbitrary.push({
				vaultPath: path,
				repoPath: path,
				status: remote ? "published" : "unpublished",
				sha: remote?.sha,
			});
		}
	}

	return arbitrary;
}

export async function categorizeFiles(
	localFiles: PublishFile[],
	remoteTree: TreeEntry[],
	cache: DataStore,
	pathMapper: PathMapper,
	linkedMedia?: Set<string>,
	arbitraryPaths?: string[],
): Promise<PublishStatus> {
	const remoteIndex = buildRemoteIndex(remoteTree, pathMapper);
	const unpublished: PublishFile[] = [];
	const changed: PublishFile[] = [];
	const published: PublishFile[] = [];

	for (const file of localFiles) {
		const vaultPath = file.getVaultPath();
		const repoPath = pathMapper.toRepoPath(vaultPath);
		const remote = remoteIndex.content.get(repoPath);
		const localHash = await cache.loadLocalHash(
			file.file.path,
			file.file.stat.mtime,
		);

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

	const { deleted, media } = classifyRemoteOnly(
		remoteIndex,
		localFiles,
		pathMapper,
		linkedMedia,
	);
	const arbitrary = classifyArbitrary(remoteIndex, arbitraryPaths);

	return {
		unpublished,
		changed,
		published,
		deleted,
		media,
		arbitrary,
	};
}
