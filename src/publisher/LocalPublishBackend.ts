import type { FileChange, TreeEntry } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import { Platform } from "obsidian";
import {
	readBinaryExternalFile,
	writeExternalFile,
	writeBinaryExternalFile,
	deleteExternalFile,
	walkExternalFiles,
	ensureParentDir,
	joinPath,
	resolveExternalPath,
	resolveWithin,
} from "src/utils/external-fs";
import { generateBlobHash } from "src/utils/utils";

// Scanning these would walk tens of thousands of files on a real Quartz repo,
// and none of them are publishable content.
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
	".git",
	"node_modules",
	"public",
	".quartz-cache",
]);

export class LocalPublishBackend implements PublishBackend {
	readonly isLocal = true;
	private cachedTree: TreeEntry[] | null = null;
	private resolvedRepoPath: string | null = null;

	constructor(private rawRepoPath: string) {}

	// Resolved lazily: the constructor must stay free of Node module access so
	// getPublisher() can construct this off the desktop app without throwing.
	private get repoPath(): string {
		this.resolvedRepoPath ??= resolveExternalPath(this.rawRepoPath);

		return this.resolvedRepoPath;
	}

	private resolveRepoPath(filePath: string): string {
		if (filePath.includes("..")) {
			throw new Error(`Path traversal rejected: ${filePath}`);
		}

		if (!Platform.isDesktopApp) {
			throw new Error("Local publishing requires a desktop app");
		}

		const resolved = resolveWithin(this.repoPath, filePath);

		if (resolved === null) {
			throw new Error(`Path escapes repository: ${filePath}`);
		}

		return resolved;
	}

	async writeFiles(
		_branch: string,
		_message: string,
		files: FileChange[],
	): Promise<{ sha: string }> {
		for (const file of files) {
			const fullPath = this.resolveRepoPath(file.path);
			await ensureParentDir(fullPath);

			if (
				file.encoding === "base64" &&
				typeof file.content === "string"
			) {
				const binary = base64ToUint8Array(file.content);
				const success = await writeBinaryExternalFile(fullPath, binary);

				if (!success) {
					throw new Error(
						`Failed to write binary file: ${file.path}`,
					);
				}
			} else if (file.content instanceof Uint8Array) {
				const success = await writeBinaryExternalFile(
					fullPath,
					file.content,
				);

				if (!success) {
					throw new Error(
						`Failed to write binary file: ${file.path}`,
					);
				}
			} else {
				const success = await writeExternalFile(fullPath, file.content);

				if (!success) {
					throw new Error(`Failed to write file: ${file.path}`);
				}
			}
		}

		this.cachedTree = null;

		return { sha: "local" };
	}

	async deleteFiles(
		_branch: string,
		_message: string,
		paths: string[],
	): Promise<{ sha: string }> {
		for (const path of paths) {
			const fullPath = this.resolveRepoPath(path);
			const success = await deleteExternalFile(fullPath);

			if (!success) {
				throw new Error(`Failed to delete file: ${path}`);
			}
		}

		this.cachedTree = null;

		return { sha: "local" };
	}

	async getTree(_ref: string): Promise<TreeEntry[]> {
		return this.buildTree();
	}

	async readBlob(path: string): Promise<Uint8Array> {
		const data = await readBinaryExternalFile(
			joinPath(this.repoPath, path),
		);

		if (!data) {
			throw new Error(`Failed to read file: ${path}`);
		}

		return data;
	}

	startPeriodicFetch(_intervalSeconds: number): void {}

	stopPeriodicFetch(): void {}

	invalidateTreeCache(): void {
		this.cachedTree = null;
	}

	async refreshTreeCache(): Promise<TreeEntry[]> {
		this.cachedTree = null;

		return this.buildTree();
	}

	async getCachedTree(_ref: string): Promise<TreeEntry[]> {
		if (this.cachedTree) return this.cachedTree;

		return this.buildTree();
	}

	private async buildTree(): Promise<TreeEntry[]> {
		const entries = await walkExternalFiles(
			this.repoPath,
			IGNORED_DIRECTORIES,
		);

		if (!entries) return [];

		const tree: TreeEntry[] = [];

		for (const entry of entries) {
			const fullPath = joinPath(this.repoPath, entry);
			const content = await readBinaryExternalFile(fullPath);
			const sha = content !== null ? await generateBlobHash(content) : "";

			tree.push({
				path: entry,
				sha,
				type: "blob",
			});
		}

		this.cachedTree = tree;

		return tree;
	}
}

function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}
