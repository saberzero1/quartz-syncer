import type QuartzSyncer from "src/main";
import { createGitBackend } from "src/git/GitBackendFactory";
import type { FileChange, GitBackend } from "src/git/types";
import type {
	RepositoryConnection,
	RepositoryDirectoryEntry,
	RepositoryFile,
} from "src/repositoryConnection/RepositoryConnection";

class GitBackendRepositoryAdapter {
	private backend: GitBackend;
	private branch: string;

	constructor(backend: GitBackend, branch: string) {
		this.backend = backend;
		this.branch = branch;
	}

	async getRawFile(path: string): Promise<RepositoryFile | undefined> {
		const entries = await this.backend.readTree(this.branch);
		const match = entries.find(
			(entry) => entry.path === path && entry.type === "blob",
		);

		if (!match) return undefined;

		const blob = await this.backend.readBlob(match.sha);
		// eslint-disable-next-line no-undef -- Buffer is available in Node.js and Electron environments
		const content = Buffer.from(blob).toString("base64");

		return {
			content,
			sha: match.sha,
			path,
			type: "file",
		};
	}

	async writeRawFiles(
		files: Map<string, string>,
		commitMessage = "Update Quartz configuration via Syncer",
	): Promise<void> {
		const changes: FileChange[] = [];

		for (const [path, content] of files.entries()) {
			changes.push({ path, content, encoding: "utf-8" });
		}

		await this.backend.writeFiles(this.branch, commitMessage, changes);
	}

	async listDirectory(path: string): Promise<RepositoryDirectoryEntry[]> {
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

	async hasCommitInHistory(_targetOid: string): Promise<boolean> {
		return false;
	}

	async upgradeFromUpstream(
		_upstreamUrl: string,
		_upstreamBranch: string,
	): Promise<{ oid: string; alreadyMerged: boolean }> {
		throw new Error("Upgrade is not available in this build.");
	}
}

export function createRepositoryAdapter(
	plugin: QuartzSyncer,
): RepositoryConnection | null {
	if (!plugin.settings.gitRemoteUrl) {
		return null;
	}

	const gitSettings = plugin.getGitSettingsWithSecret();
	const backend = createGitBackend(
		{
			remoteUrl: gitSettings.remoteUrl,
			branch: gitSettings.branch,
			corsProxyUrl: gitSettings.corsProxyUrl,
			auth: gitSettings.auth,
		},
		plugin.app,
	);
	const branch = plugin.settings.gitBranch || "v4";

	return new GitBackendRepositoryAdapter(backend, branch);
}

export function getValueByPath(
	input: Record<string, unknown>,
	path: string,
): unknown {
	if (!path) return undefined;

	if (Object.prototype.hasOwnProperty.call(input, path)) {
		return input[path];
	}

	const parts = path.split(".");
	let current: unknown = input;

	for (const part of parts) {
		if (!current || typeof current !== "object") return undefined;
		const record = current as Record<string, unknown>;
		if (!Object.prototype.hasOwnProperty.call(record, part)) {
			return undefined;
		}
		current = record[part];
	}

	return current;
}

export function setValueByPath(
	input: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	if (!path) return;

	if (Object.prototype.hasOwnProperty.call(input, path)) {
		input[path] = value;
		return;
	}

	const parts = path.split(".");
	let current: Record<string, unknown> = input;

	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (!part) continue;

		if (index === parts.length - 1) {
			current[part] = value;
			return;
		}

		const existing = current[part];
		if (
			!existing ||
			typeof existing !== "object" ||
			Array.isArray(existing)
		) {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
			continue;
		}

		current = existing as Record<string, unknown>;
	}
}

export function parseCliValue(rawValue: string | undefined): unknown {
	if (rawValue === undefined) return undefined;
	const trimmed = rawValue.trim();

	if (trimmed === "") return "";

	const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
	const isPrimitive =
		trimmed === "true" ||
		trimmed === "false" ||
		trimmed === "null" ||
		/^-?\d+(\.\d+)?$/.test(trimmed);

	if (looksLikeJson || isPrimitive) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return rawValue;
		}
	}

	return rawValue;
}
