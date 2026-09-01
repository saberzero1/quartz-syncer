import type {
	QuartzDirectoryEntry,
	QuartzFileSource,
} from "src/quartz/QuartzFileSource";
import {
	readExternalFile,
	writeExternalFile,
	writeBinaryExternalFile,
	deleteExternalFile,
	readExternalDir,
	readExternalDirRecursive,
	externalFileExists,
	externalIsDirectorySync,
	ensureParentDir,
	joinPath,
	getModule,
} from "src/utils/external-fs";

export class LocalFileSource implements QuartzFileSource {
	constructor(private basePath: string) {}

	async readFile(path: string): Promise<string | null> {
		this.validatePath(path);
		return readExternalFile(joinPath(this.basePath, path));
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.validatePath(path);
		const fullPath = joinPath(this.basePath, path);
		await ensureParentDir(fullPath);
		const success = await writeExternalFile(fullPath, content);

		if (!success) {
			throw new Error(`Failed to write file: ${path}`);
		}
	}

	async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
		this.validatePath(path);
		const fullPath = joinPath(this.basePath, path);
		const success = await writeBinaryExternalFile(fullPath, data);

		if (!success) {
			throw new Error(`Failed to write binary file: ${path}`);
		}
	}

	async deleteFile(path: string): Promise<void> {
		this.validatePath(path);
		const fullPath = joinPath(this.basePath, path);
		const success = await deleteExternalFile(fullPath);

		if (!success) {
			throw new Error(`Failed to delete file: ${path}`);
		}
	}

	async listDirectory(path: string): Promise<QuartzDirectoryEntry[]> {
		const fullPath = joinPath(this.basePath, path);
		const names = await readExternalDir(fullPath);

		if (!names) return [];

		const entries: QuartzDirectoryEntry[] = [];

		for (const name of names) {
			const childPath = joinPath(fullPath, name);
			const isDir = this.isDirectory(childPath);
			entries.push({
				name,
				type: isDir ? "tree" : "blob",
			});
		}

		return entries;
	}

	async listAllFiles(basePath?: string): Promise<string[]> {
		const dirPath = basePath
			? joinPath(this.basePath, basePath)
			: this.basePath;
		const entries = await readExternalDirRecursive(dirPath);

		if (!entries) return [];

		const files: string[] = [];

		for (const entry of entries) {
			const fullPath = joinPath(dirPath, entry);

			if (!this.isDirectory(fullPath)) {
				// Repo-relative paths must stay forward-slash even on Windows.
				files.push(basePath ? `${basePath}/${entry}` : entry);
			}
		}

		return files;
	}

	async exists(path: string): Promise<boolean> {
		return externalFileExists(joinPath(this.basePath, path));
	}

	private isDirectory(fullPath: string): boolean {
		return externalIsDirectorySync(fullPath);
	}

	private validatePath(path: string): void {
		if (path.includes("..")) {
			throw new Error(`Path traversal rejected: ${path}`);
		}

		const pathModule = getModule<{ resolve(...p: string[]): string }>(
			"path",
		);
		const resolved = pathModule.resolve(this.basePath, path);

		if (!resolved.startsWith(this.basePath)) {
			throw new Error(`Path escapes base directory: ${path}`);
		}
	}
}
