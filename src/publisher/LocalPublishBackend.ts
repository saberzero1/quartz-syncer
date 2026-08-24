import type { FileChange, TreeEntry } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import {
	readExternalFile,
	readBinaryExternalFile,
	writeExternalFile,
	writeBinaryExternalFile,
	deleteExternalFile,
	readExternalDirRecursive,
	ensureParentDir,
	externalIsDirectorySync,
	joinPath,
	getModule,
} from "src/utils/external-fs";
import { generateBlobHash } from "src/utils/utils";

export class LocalPublishBackend implements PublishBackend {
	readonly isLocal = true;
	private cachedTree: TreeEntry[] | null = null;

	constructor(private repoPath: string) {}

	private validatePath(filePath: string): void {
		if (filePath.includes("..")) {
			throw new Error(`Path traversal rejected: ${filePath}`);
		}

		const pathModule = getModule<{ resolve(...p: string[]): string }>(
			"path",
		);
		const resolved = pathModule.resolve(this.repoPath, filePath);

		if (!resolved.startsWith(this.repoPath)) {
			throw new Error(`Path escapes repository: ${filePath}`);
		}
	}

	async writeFiles(
		_branch: string,
		_message: string,
		files: FileChange[],
	): Promise<{ sha: string }> {
		for (const file of files) {
			this.validatePath(file.path);
			const fullPath = joinPath(this.repoPath, file.path);
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
			this.validatePath(path);
			const fullPath = joinPath(this.repoPath, path);
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
		const entries = await readExternalDirRecursive(this.repoPath);

		if (!entries) return [];

		const tree: TreeEntry[] = [];

		for (const entry of entries) {
			const fullPath = joinPath(this.repoPath, entry);

			if (externalIsDirectorySync(fullPath)) continue;

			const content = await readExternalFile(fullPath);
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
