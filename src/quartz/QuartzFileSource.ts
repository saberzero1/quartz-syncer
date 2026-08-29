/**
 * Abstraction for reading/writing files from a Quartz repository.
 *
 * Two implementations:
 * - RemoteFileSource: reads from git remote via BundledGitBackend (desktop + mobile)
 * - LocalFileSource: reads/writes from local disk (desktop only)
 */
export interface QuartzFileSource {
	readFile(path: string): Promise<string | null>;
	writeFile(path: string, content: string): Promise<void>;
	writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
	deleteFile(path: string): Promise<void>;
	listDirectory(path: string): Promise<QuartzDirectoryEntry[]>;
	listAllFiles(basePath?: string): Promise<string[]>;
	exists(path: string): Promise<boolean>;
}

export interface QuartzDirectoryEntry {
	name: string;
	type: "blob" | "tree";
}
