import type { App } from "obsidian";

type FsStat = {
	isFile: () => boolean;
	isDirectory: () => boolean;
	isSymbolicLink: () => boolean;
	mtimeMs?: number;
	size?: number;
};

type FsPromises = {
	readFile: (
		path: string,
		options?: { encoding?: string },
	) => Promise<string | Buffer>;
	writeFile: (
		path: string,
		data: string | Uint8Array | ArrayBuffer,
		options?: { encoding?: string },
	) => Promise<void>;
	unlink: (path: string) => Promise<void>;
	readdir: (path: string) => Promise<string[]>;
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
	rmdir: (path: string) => Promise<void>;
	stat: (path: string) => Promise<FsStat>;
	lstat: (path: string) => Promise<FsStat>;
	readlink: (path: string) => Promise<string>;
	symlink: (target: string, path: string) => Promise<void>;
};

type FsClient = {
	promises: FsPromises;
};

export class VaultFsAdapter implements FsClient {
	readonly promises: FsPromises;
	private basePath: string;
	private adapter: App["vault"]["adapter"];

	constructor(app: App, basePath: string) {
		this.adapter = app.vault.adapter;
		this.basePath = normalizePath(basePath);
		this.promises = {
			readFile: (...args: Parameters<FsPromises["readFile"]>) =>
				this.readFile(...args),
			writeFile: (...args: Parameters<FsPromises["writeFile"]>) =>
				this.writeFile(...args),
			unlink: (path: string) => this.unlink(path),
			readdir: (path: string) => this.readdir(path),
			mkdir: (path: string, options?: { recursive?: boolean }) =>
				this.mkdir(path, options),
			rmdir: (path: string) => this.rmdir(path),
			stat: (path: string) => this.stat(path),
			lstat: (path: string) => this.lstat(path),
			readlink: (path: string) => Promise.resolve(path),
			symlink: (_target: string, _path: string) => Promise.resolve(),
		};
	}

	private resolvePath(path: string): string {
		const normalized = normalizePath(path);
		if (!normalized || normalized === ".") {
			return this.basePath;
		}
		if (
			normalized === this.basePath ||
			normalized.startsWith(`${this.basePath}/`)
		) {
			return normalized;
		}
		return this.basePath ? `${this.basePath}/${normalized}` : normalized;
	}

	private async readFile(
		path: string,
		options?: { encoding?: string },
	): Promise<string | Buffer> {
		await this.ensureExists(path);
		if (options?.encoding === "utf8" || options?.encoding === "utf-8") {
			return this.adapter.read(this.resolvePath(path));
		}
		const data = await this.adapter.readBinary(this.resolvePath(path));
		return Buffer.from(data);
	}

	private async writeFile(
		path: string,
		data: string | Uint8Array | ArrayBuffer,
		options?: { encoding?: string },
	): Promise<void> {
		const resolvedPath = this.resolvePath(path);
		const encoding = options?.encoding;
		if (typeof data === "string") {
			if (encoding === "base64") {
				const bytes = Buffer.from(data, "base64");
				await this.adapter.writeBinary(
					resolvedPath,
					toArrayBuffer(bytes),
				);
				return;
			}
			await this.adapter.write(resolvedPath, data);
			return;
		}

		const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
		await this.adapter.writeBinary(resolvedPath, toArrayBuffer(bytes));
	}

	private async unlink(path: string): Promise<void> {
		await this.adapter.remove(this.resolvePath(path));
	}

	private async readdir(path: string): Promise<string[]> {
		const listing = await this.adapter.list(this.resolvePath(path));
		const entries = [...listing.files, ...listing.folders];
		return entries.map((entry) => basename(entry));
	}

	private async mkdir(
		path: string,
		options?: { recursive?: boolean },
	): Promise<void> {
		const resolvedPath = this.resolvePath(path);
		if (!options?.recursive) {
			await this.adapter.mkdir(resolvedPath);
			return;
		}
		const segments = resolvedPath.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			try {
				await this.adapter.mkdir(current);
			} catch (error) {
				const code = (error as { code?: string }).code;
				if (code !== "EEXIST") {
					throw error;
				}
			}
		}
	}

	private async rmdir(path: string): Promise<void> {
		await this.adapter.remove(this.resolvePath(path));
	}

	private async stat(path: string): Promise<FsStat> {
		const stat = await this.getStatOrThrow(path);
		return buildStat(stat);
	}

	private async lstat(path: string): Promise<FsStat> {
		return this.stat(path);
	}

	private async ensureExists(path: string): Promise<void> {
		await this.getStatOrThrow(path);
	}

	private async getStatOrThrow(path: string) {
		const stat = await this.adapter.stat(this.resolvePath(path));
		if (!stat) {
			throw createEnoent(this.resolvePath(path));
		}
		return stat;
	}
}

function normalizePath(path: string): string {
	return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function basename(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const parts = normalized.split("/");
	return parts[parts.length - 1] ?? "";
}

function buildStat(stat: {
	type: string;
	mtime?: number;
	size?: number;
}): FsStat {
	const isFile = stat.type === "file";
	const isDirectory = stat.type === "folder";
	return {
		isFile: () => isFile,
		isDirectory: () => isDirectory,
		isSymbolicLink: () => false,
		mtimeMs: stat.mtime,
		size: stat.size,
	};
}

function createEnoent(path: string): Error & { code: string } {
	const error = new Error(
		`ENOENT: no such file or directory, ${path}`,
	) as Error & {
		code: string;
	};
	error.code = "ENOENT";
	return error;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	return data.buffer.slice(
		data.byteOffset,
		data.byteOffset + data.byteLength,
	) as ArrayBuffer;
}
