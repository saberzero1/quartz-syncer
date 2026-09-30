import { Platform } from "obsidian";
import { getModule, joinPath, resolveExternalPath } from "./external-fs";

export type ExternalFileMetadata = {
	readonly path: string;
	readonly size: number | null;
	readonly mtime: number | null;
};

export async function walkExternalFileMetadata(
	dirPath: string,
	ignoredDirectories: ReadonlySet<string>,
): Promise<ExternalFileMetadata[] | null> {
	if (!Platform.isDesktopApp) return null;
	const files: ExternalFileMetadata[] = [];
	try {
		const fs = getModule<typeof import("fs/promises")>("fs/promises");
		const walk = async (
			absoluteDir: string,
			relativeDir: string,
		): Promise<void> => {
			const entries = await fs.readdir(absoluteDir, {
				withFileTypes: true,
			});
			for (const entry of entries) {
				const relativePath = relativeDir
					? `${relativeDir}/${entry.name}`
					: entry.name;
				const absolutePath = joinPath(absoluteDir, entry.name);
				if (entry.isDirectory()) {
					if (!ignoredDirectories.has(entry.name))
						await walk(absolutePath, relativePath);
					continue;
				}
				if (!entry.isFile() && !entry.isSymbolicLink()) continue;
				try {
					// One stat provides both metadata and symlink classification.
					const stats = await fs.stat(absolutePath);
					if (!stats.isDirectory())
						files.push({
							path: relativePath,
							size: stats.size,
							mtime: stats.mtimeMs,
						});
				} catch {
					// An unreadable regular file still gets the existing read/hash
					// fallback, but can never hit or populate the metadata cache.
					if (entry.isFile())
						files.push({
							path: relativePath,
							size: null,
							mtime: null,
						});
				}
			}
		};
		await walk(resolveExternalPath(dirPath), "");
		return files;
	} catch {
		return null;
	}
}
