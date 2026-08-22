import type { FileChange, GitBackend } from "src/git/types";
import type {
	QuartzDirectoryEntry,
	QuartzFileSource,
} from "src/quartz/QuartzFileSource";

export class RemoteFileSource implements QuartzFileSource {
	constructor(
		private backend: GitBackend,
		private branch: string,
	) {}

	async readFile(path: string): Promise<string | null> {
		const entries = await this.backend.readTree(this.branch);
		const match = entries.find(
			(entry) => entry.path === path && entry.type === "blob",
		);

		if (!match) return null;

		const blob = await this.backend.readBlob(match.sha);

		return new TextDecoder().decode(blob);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const changes: FileChange[] = [{ path, content, encoding: "utf-8" }];

		await this.backend.writeFiles(
			this.branch,
			"Update Quartz configuration via Syncer",
			changes,
		);
	}

	async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
		const base64 = uint8ArrayToBase64(data);
		const changes: FileChange[] = [
			{ path, content: base64, encoding: "base64" },
		];

		await this.backend.writeFiles(
			this.branch,
			"Update binary file via Syncer",
			changes,
		);
	}

	async deleteFile(path: string): Promise<void> {
		await this.backend.deleteFiles(this.branch, "Delete file via Syncer", [
			path,
		]);
	}

	async listDirectory(path: string): Promise<QuartzDirectoryEntry[]> {
		const entries = await this.backend.readTree(this.branch);
		const prefix = path.endsWith("/") ? path : `${path}/`;
		const results = new Map<string, "blob" | "tree">();

		for (const entry of entries) {
			if (!entry.path.startsWith(prefix)) continue;
			const remainder = entry.path.slice(prefix.length);
			if (!remainder) continue;
			const parts = remainder.split("/");
			const name = parts[0];
			if (!name) continue;

			if (parts.length === 1 && entry.type === "blob") {
				results.set(name, "blob");
			} else {
				results.set(name, "tree");
			}
		}

		return [...results.entries()].map(([name, type]) => ({ name, type }));
	}

	async listAllFiles(basePath?: string): Promise<string[]> {
		const entries = await this.backend.readTree(this.branch);
		const files: string[] = [];

		for (const entry of entries) {
			if (entry.type !== "blob") continue;

			if (basePath) {
				const prefix = basePath.endsWith("/")
					? basePath
					: `${basePath}/`;

				if (!entry.path.startsWith(prefix)) continue;
			}

			files.push(entry.path);
		}

		return files;
	}

	async exists(path: string): Promise<boolean> {
		const entries = await this.backend.readTree(this.branch);

		return entries.some((entry) => entry.path === path);
	}
}

function uint8ArrayToBase64(data: Uint8Array): string {
	let binary = "";

	for (let i = 0; i < data.length; i += 1) {
		binary += String.fromCharCode(data[i]!);
	}

	return btoa(binary);
}
