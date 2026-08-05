import type {
	QuartzDirectoryEntry,
	QuartzFileSource,
} from "src/quartz/QuartzFileSource";
import {
	readExternalFile,
	writeExternalFile,
	readExternalDir,
	externalFileExists,
	externalIsDirectorySync,
	joinPath,
} from "src/utils/external-fs";

export class LocalFileSource implements QuartzFileSource {
	constructor(private basePath: string) {}

	async readFile(path: string): Promise<string | null> {
		return readExternalFile(joinPath(this.basePath, path));
	}

	async writeFile(path: string, content: string): Promise<void> {
		const success = await writeExternalFile(
			joinPath(this.basePath, path),
			content,
		);

		if (!success) {
			throw new Error(`Failed to write file: ${path}`);
		}
	}

	async listDirectory(path: string): Promise<QuartzDirectoryEntry[]> {
		const fullPath = joinPath(this.basePath, path);
		const names = await readExternalDir(fullPath);

		if (!names) return [];

		const entries: QuartzDirectoryEntry[] = [];

		for (const name of names) {
			const childPath = joinPath(fullPath, name);
			const isDir = await this.isDirectory(childPath);
			entries.push({
				name,
				type: isDir ? "tree" : "blob",
			});
		}

		return entries;
	}

	async exists(path: string): Promise<boolean> {
		return externalFileExists(joinPath(this.basePath, path));
	}

	private isDirectory(fullPath: string): boolean {
		return externalIsDirectorySync(fullPath);
	}
}
