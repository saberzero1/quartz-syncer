import type QuartzSyncerSettings from "src/models/settings";
import { type MetadataCache } from "obsidian";
import { Base64 } from "js-base64";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "src/repositoryConnection/RepositoryConnection";

export interface PathRewriteRule {
	from: string;
	to: string;
}

export type VaultPathRule = PathRewriteRule;

type ContentTreeItem = {
	path: string;
	oid: string;
	type: "blob" | "tree" | "commit";
};

export default class QuartzSyncerSiteManager {
	settings: QuartzSyncerSettings;
	metadataCache: MetadataCache;
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;

	constructor(metadataCache: MetadataCache, settings: QuartzSyncerSettings) {
		this.settings = settings;
		this.metadataCache = metadataCache;

		this.baseSyncerConnection = new RepositoryConnection({
			gitSettings: {
				remoteUrl: "https://github.com/saberzero1/quartz.git",
				branch: "main",
				auth: { type: "none" },
			},
			contentFolder: "content",
			vaultPath: "/",
		});

		this.userSyncerConnection = new RepositoryConnection({
			gitSettings: settings.git,
			contentFolder: settings.contentFolder,
			vaultPath: settings.vaultPath,
		});
	}

	async getNoteContent(path: string): Promise<string> {
		if (path.startsWith("/")) {
			path = path.substring(1);
		}

		const response = await this.userSyncerConnection.getFile(
			`${this.settings.contentFolder}/${path}`,
		);

		if (!response) {
			return "";
		}

		const content = Base64.decode(response.content);

		return content;
	}

	async getNoteHashes(
		contentTree: NonNullable<TRepositoryContent>,
	): Promise<Record<string, string>> {
		const files = contentTree.tree;

		const notes = files.filter(
			(x): x is ContentTreeItem =>
				typeof x.path === "string" &&
				x.path.startsWith(this.settings.contentFolder) &&
				x.type === "blob" &&
				x.path.endsWith(".md"),
		);
		const hashes: Record<string, string> = {};

		for (const note of notes) {
			const vaultPath = note.path.replace(
				this.settings.contentFolder,
				"",
			);

			const actualVaultPath = vaultPath.startsWith("/")
				? vaultPath.substring(1)
				: vaultPath;
			hashes[actualVaultPath] = note.oid;
		}

		return hashes;
	}

	async getBlobHashes(
		contentTree: NonNullable<TRepositoryContent>,
	): Promise<Record<string, string>> {
		const files = contentTree.tree ?? [];

		const blobs = files.filter(
			(x): x is ContentTreeItem =>
				typeof x.path === "string" &&
				x.path.startsWith(this.settings.contentFolder) &&
				x.type === "blob",
		);
		const hashes: Record<string, string> = {};

		for (const blob of blobs) {
			const vaultPath = blob.path.replace(
				this.settings.contentFolder,
				"",
			);

			const actualVaultPath = vaultPath.startsWith("/")
				? vaultPath.substring(1)
				: vaultPath;
			hashes[actualVaultPath] = blob.oid;
		}

		return hashes;
	}
}
