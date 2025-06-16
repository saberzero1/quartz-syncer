import type QuartzSyncerSettings from "src/models/settings";
import { type MetadataCache, Notice } from "obsidian";
import { Base64 } from "js-base64";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "src/repositoryConnection/RepositoryConnection";
import Logger from "js-logger";

const logger = Logger.get("quartz-syncer-site-manager");

/**
 * PathRewriteRule interface.
 * This interface defines a rule for rewriting paths in the Quartz site.
 */
export interface PathRewriteRule {
	from: string;
	to: string;
}

/**
 * VaultPathRule interface.
 * This interface extends PathRewriteRule and is used for vault path rules in the Quartz site.
 * It is an alias for PathRewriteRule.
 */
export type VaultPathRule = PathRewriteRule;

/**
 * ContentTreeItem type.
 * This type represents an item in the content tree of the Quartz site.
 */
type ContentTreeItem = {
	path: string;
	sha: string;
	type: string;
};

/**
 * QuartzSyncerSiteManager class.
 *
 * Manages the Quartz website contents by handling various site configurations, files,
 * and interactions with GitHub via Octokit. Responsible for operations like updating
 * content for site changes or settings, retrieving note content, and managing
 * repository connections.
 */
export default class QuartzSyncerSiteManager {
	settings: QuartzSyncerSettings;
	metadataCache: MetadataCache;
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;

	constructor(metadataCache: MetadataCache, settings: QuartzSyncerSettings) {
		this.settings = settings;
		this.metadataCache = metadataCache;

		this.baseSyncerConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: "saberzero1",
			quartzRepository: "quartz",
			contentFolder: "content",
			vaultPath: "/",
		});

		this.userSyncerConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: settings.githubUserName,
			quartzRepository: settings.githubRepo,
			contentFolder: settings.contentFolder,
			vaultPath: settings.vaultPath,
		});
	}

	/**
	 * Updates the Quartz site with the current settings.
	 * This method updates the `.env` file in the user's repository
	 * with the current settings, such as timestamps and image resolution.
	 * If the `.env` file already matches the current settings, it does nothing.
	 *
	 * @returns A promise that resolves when the update is complete.
	 */
	async updateEnv() {
		const envValues = {
			SHOW_CREATED_TIMESTAMP: this.settings.showCreatedTimestamp,
			SHOW_UPDATED_TIMESTAMP: this.settings.showUpdatedTimestamp,
			SHOW_PUBLISHED_TIMESTAMP: this.settings.showPublishedTimestamp,
			TIMESTAMP_FORMAT: this.settings.timestampFormat,
			USE_FULL_RESOLUTION_IMAGES: this.settings.useFullResolutionImages,
		} as Record<string, string | boolean>;

		const keysToSet = {
			...envValues,
		};

		const envSettings = Object.entries(keysToSet)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		const base64Settings = Base64.encode(envSettings);

		const currentFile = await this.userSyncerConnection.getFile(".env");

		const decodedCurrentFile = Base64.decode(currentFile?.content ?? "");

		if (decodedCurrentFile === envSettings) {
			logger.info("No changes to .env file");

			new Notice("Settings already up to date!");

			return;
		}

		await this.userSyncerConnection.updateFile({
			path: ".env",
			content: base64Settings,
			message: "Update settings",
			sha: currentFile?.sha,
		});
	}

	/**
	 * Retrieves the content of a note from the Quartz repository.
	 *
	 * @param path - The path to the note in the Quartz repository.
	 * @returns A promise that resolves when the update is complete.
	 */
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

	/**
	 * Retrieves the note hashes from the content tree of the Quartz repository.
	 *
	 * @param contentTree - The content tree of the repository.
	 * @returns A promise that resolves to the content tree of the repository.
	 */
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
			hashes[actualVaultPath] = note.sha;
		}

		return hashes;
	}

	/**
	 * Retrieves the blob hashes from the content tree of the Quartz repository.
	 *
	 * @param contentTree - The content tree of the repository.
	 * @returns A promise that resolves to a record of blob hashes.
	 */
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
			hashes[actualVaultPath] = blob.sha;
		}

		return hashes;
	}
}
