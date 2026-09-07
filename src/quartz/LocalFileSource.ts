import type {
	QuartzDirectoryEntry,
	QuartzFileSource,
} from "src/quartz/QuartzFileSource";
import { Platform } from "obsidian";
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
	resolveExternalPath,
	resolveWithin,
} from "src/utils/external-fs";

export class LocalFileSource implements QuartzFileSource {
	private resolvedBasePath: string | null = null;

	constructor(private rawBasePath: string) {}

	// Resolved lazily: the constructor must stay free of Node module access so
	// callers can construct this off the desktop app without throwing.
	private get basePath(): string {
		this.resolvedBasePath ??= resolveExternalPath(this.rawBasePath);

		return this.resolvedBasePath;
	}

	async readFile(path: string): Promise<string | null> {
		return readExternalFile(this.resolveBasePath(path));
	}

	async writeFile(path: string, content: string): Promise<void> {
		const fullPath = this.resolveBasePath(path);
		await ensureParentDir(fullPath);
		const success = await writeExternalFile(fullPath, content);

		if (!success) {
			throw new Error(`Failed to write file: ${path}`);
		}
	}

	async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
		const fullPath = this.resolveBasePath(path);
		const success = await writeBinaryExternalFile(fullPath, data);

		if (!success) {
			throw new Error(`Failed to write binary file: ${path}`);
		}
	}

	async deleteFile(path: string): Promise<void> {
		const fullPath = this.resolveBasePath(path);
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
				files.push(basePath ? joinPath(basePath, entry) : entry);
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

	private resolveBasePath(path: string): string {
		if (path.includes("..")) {
			throw new Error(`Path traversal rejected: ${path}`);
		}

		if (!Platform.isDesktopApp) {
			throw new Error("Local repository access requires a desktop app");
		}

		const resolved = resolveWithin(this.basePath, path);

		if (resolved === null) {
			throw new Error(`Path escapes base directory: ${path}`);
		}

		return resolved;
	}
}
