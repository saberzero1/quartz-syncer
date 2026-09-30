import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";
import type { TreeEntry } from "src/git/types";
import type { ExternalFileMetadata } from "src/utils/external-file-metadata";
import { joinPath, readBinaryExternalFile } from "src/utils/external-fs";
import { batchParallel, generateBlobHash } from "src/utils/utils";

type CachedFileHash = {
	readonly path: string;
	readonly size: number;
	readonly mtime: number;
	readonly sha: string;
};

function isCachedFileHash(value: unknown): value is CachedFileHash {
	return (
		typeof value === "object" &&
		value !== null &&
		"path" in value &&
		typeof value.path === "string" &&
		value.path.length > 0 &&
		"size" in value &&
		typeof value.size === "number" &&
		Number.isSafeInteger(value.size) &&
		value.size >= 0 &&
		"mtime" in value &&
		typeof value.mtime === "number" &&
		Number.isFinite(value.mtime) &&
		"sha" in value &&
		typeof value.sha === "string" &&
		/^[0-9a-f]{40}$/.test(value.sha)
	);
}

export async function buildCachedLocalTree(
	repoPath: string,
	entries: ExternalFileMetadata[],
): Promise<TreeEntry[]> {
	let store: IndexedDBStore | null = null;
	let cached = new Map<string, CachedFileHash>();
	try {
		try {
			// Repo paths, unlike vault names, identify the bytes being hashed.
			// Each record is a full snapshot keyed by absolute repo path; paths
			// inside that snapshot are relative to that repository only.
			store = createStore("quartz-syncer/local-tree-hashes/v1");
			const value = await store.getItem<unknown>(repoPath);
			if (Array.isArray(value) && value.every(isCachedFileHash)) {
				const parsed = new Map(
					value.map((entry) => [entry.path, entry]),
				);
				if (parsed.size === value.length) cached = parsed;
			}
		} catch {
			// Storage is optional: any read/open failure means a full rehash.
			cached = new Map();
		}

		const hashes = new Map<string, string>();
		const misses = entries.filter((entry) => {
			const previous = cached.get(entry.path);
			if (
				previous &&
				previous.size === entry.size &&
				previous.mtime === entry.mtime
			) {
				hashes.set(entry.path, previous.sha);
				return false;
			}
			return true;
		});
		await batchParallel(
			misses,
			async (entry) => {
				const content = await readBinaryExternalFile(
					joinPath(repoPath, entry.path),
				);
				const sha =
					content !== null ? await generateBlobHash(content) : "";
				hashes.set(entry.path, sha);
			},
			5,
		);

		const snapshot: CachedFileHash[] = [];
		const tree: TreeEntry[] = entries.map((entry) => {
			const sha = hashes.get(entry.path) ?? "";
			if (sha && entry.size !== null && entry.mtime !== null) {
				snapshot.push({
					path: entry.path,
					size: entry.size,
					mtime: entry.mtime,
					sha,
				});
			}
			return { path: entry.path, sha, type: "blob" };
		});
		try {
			// Replacing the snapshot evicts removed paths and failed reads.
			await store?.setItem(repoPath, snapshot);
		} catch {
			// A quota/storage failure must not discard a correctly built tree.
			return tree;
		}
		return tree;
	} finally {
		store?.close();
	}
}
