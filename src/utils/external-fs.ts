import { Platform } from "obsidian";

type FsPromisesType = {
	readFile(path: string, options: { encoding: string }): Promise<string>;
	readFile(path: string): Promise<Buffer>;
	writeFile(
		path: string,
		data: string,
		options: { encoding: string },
	): Promise<void>;
	writeFile(path: string, data: Buffer): Promise<void>;
	access(path: string): Promise<void>;
	readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>;
	stat(path: string): Promise<{
		isFile(): boolean;
		isDirectory(): boolean;
	}>;
	unlink(path: string): Promise<void>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
};

type FsSyncType = {
	existsSync(path: string): boolean;
	statSync(path: string): {
		isFile(): boolean;
		isDirectory(): boolean;
	};
};

type PathType = {
	join(...paths: string[]): string;
};

type OsType = {
	homedir(): string;
};

let fsPromisesCache: FsPromisesType | null = null;
let fsSyncCache: FsSyncType | null = null;
let pathCache: PathType | null = null;
let osCache: OsType | null = null;

export function getModule<T>(name: string): T {
	const requireFn = (
		window as Window & { require?: (module: string) => unknown }
	).require;
	if (!requireFn) {
		throw new Error("Node modules unavailable");
	}
	return requireFn(name) as T;
}

function getFsPromises(): FsPromisesType {
	if (!fsPromisesCache) {
		fsPromisesCache = getModule<FsPromisesType>("fs/promises");
	}
	return fsPromisesCache;
}

function getFsSync(): FsSyncType {
	if (!fsSyncCache) {
		fsSyncCache = getModule<FsSyncType>("fs");
	}
	return fsSyncCache;
}

function getPath(): PathType {
	if (!pathCache) {
		pathCache = getModule<PathType>("path");
	}
	return pathCache;
}

function getOs(): OsType {
	if (!osCache) {
		osCache = getModule<OsType>("os");
	}
	return osCache;
}

export function isAbsolutePath(p: string): boolean {
	if (p.startsWith("/") || p.startsWith("~")) return true;
	if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\")) return true;
	return false;
}

export function expandTilde(p: string): string {
	if (!p.startsWith("~")) return p;
	if (!Platform.isDesktopApp) return p;
	const os = getOs();
	const home = os.homedir();
	if (p === "~") return home;
	if (p.startsWith("~/") || p.startsWith("~\\")) {
		return home + p.slice(1);
	}
	return p;
}

export function joinPath(...segments: string[]): string {
	return getPath().join(...segments);
}

export async function readExternalFile(
	filePath: string,
): Promise<string | null> {
	if (!Platform.isDesktopApp) return null;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		return await fs.readFile(resolved, { encoding: "utf-8" });
	} catch {
		return null;
	}
}

export async function writeExternalFile(
	filePath: string,
	content: string,
): Promise<boolean> {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		await fs.writeFile(resolved, content, { encoding: "utf-8" });
		return true;
	} catch {
		return false;
	}
}

export async function readExternalDir(
	dirPath: string,
): Promise<string[] | null> {
	if (!Platform.isDesktopApp) return null;

	const resolved = expandTilde(dirPath);
	try {
		const fs = getFsPromises();
		return await fs.readdir(resolved);
	} catch {
		return null;
	}
}

export async function externalFileExists(filePath: string): Promise<boolean> {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		await fs.access(resolved);
		return true;
	} catch {
		return false;
	}
}

export function externalFileExistsSync(filePath: string): boolean {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsSync();
		return fs.existsSync(resolved);
	} catch {
		return false;
	}
}

export function externalIsDirectorySync(dirPath: string): boolean {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(dirPath);
	try {
		const fs = getFsSync();
		return fs.statSync(resolved).isDirectory();
	} catch {
		return false;
	}
}

export async function writeBinaryExternalFile(
	filePath: string,
	data: Uint8Array,
): Promise<boolean> {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		const path = getPath();
		const dir = path.join(resolved, "..");
		await fs.mkdir(dir, { recursive: true });
		const BufferCtor = getModule<{
			Buffer: { from(data: Uint8Array): Buffer };
		}>("buffer").Buffer;
		await fs.writeFile(resolved, BufferCtor.from(data));
		return true;
	} catch {
		return false;
	}
}

export async function readBinaryExternalFile(
	filePath: string,
): Promise<Uint8Array | null> {
	if (!Platform.isDesktopApp) return null;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		const buffer = await (fs.readFile as (path: string) => Promise<Buffer>)(
			resolved,
		);
		return new Uint8Array(buffer);
	} catch {
		return null;
	}
}

export async function deleteExternalFile(filePath: string): Promise<boolean> {
	if (!Platform.isDesktopApp) return false;

	const resolved = expandTilde(filePath);
	try {
		const fs = getFsPromises();
		await fs.unlink(resolved);
		return true;
	} catch {
		return false;
	}
}

export async function readExternalDirRecursive(
	dirPath: string,
): Promise<string[] | null> {
	if (!Platform.isDesktopApp) return null;

	const resolved = expandTilde(dirPath);
	try {
		const fs = getFsPromises();
		return await fs.readdir(resolved, { recursive: true });
	} catch {
		return null;
	}
}

export async function ensureParentDir(filePath: string): Promise<void> {
	if (!Platform.isDesktopApp) return;

	const resolved = expandTilde(filePath);
	const path = getPath();
	const dir = path.join(resolved, "..");
	const fs = getFsPromises();
	await fs.mkdir(dir, { recursive: true });
}
