import { App, MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { getRewriteRules } from "src/utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "src/publishFile/Validator";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "src/models/settings";
import { Assets, SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { CompiledPublishFile, PublishFile } from "src/publishFile/PublishFile";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { DataStore } from "src/datastore/DataStore";
import Logger from "js-logger";

/**
 * MarkedForPublishing interface.
 * Represents the files and blobs that are marked for publishing.
 */
export interface MarkedForPublishing {
	notes: PublishFile[];
	blobs: string[];
}

/**
 * Publisher class.
 * Prepares files to be published and publishes them to Github
 */
export default class Publisher {
	app: App;
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: SyncerPageCompiler;
	settings: QuartzSyncerSettings;
	rewriteRule: PathRewriteRule;
	vaultPath: string;
	datastore: DataStore;

	constructor(
		app: App,
		vault: Vault,
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
		datastore: DataStore,
	) {
		this.app = app;
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.rewriteRule = getRewriteRules(settings.vaultPath);
		this.vaultPath = settings.vaultPath;
		this.datastore = datastore;

		this.compiler = new SyncerPageCompiler(
			app,
			vault,
			settings,
			metadataCache,
			datastore,
			() => this.getFilesMarkedForPublishing(),
		);
	}

	/**
	 * Checks if the file should be published based on its frontmatter.
	 *
	 * @param file - The file to check.
	 * @returns true if the file should be published, false otherwise.
	 */
	shouldPublish(file: TFile): boolean {
		const frontMatter = this.metadataCache.getCache(file.path)?.frontmatter;

		return hasPublishFlag(this.settings.publishFrontmatterKey, frontMatter);
	}

	/**
	 * Gets the files that are marked for publishing.
	 *
	 * @returns A promise that resolves to an object containing notes and blobs to be published.
	 */
	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const files = this.vault.getMarkdownFiles().filter((file) => {
			if (
				this.settings.vaultPath !== "/" &&
				this.settings.vaultPath !== ""
			)
				return file.path.startsWith(this.settings.vaultPath);

			return true;
		});
		const notesToPublish: PublishFile[] = [];
		const blobsToPublish: Set<string> = new Set();

		for (const file of files) {
			try {
				if (this.shouldPublish(file)) {
					const publishFile = new PublishFile({
						file,
						compiler: this.compiler,
						metadataCache: this.metadataCache,
						vault: this.vault,
						settings: this.settings,
						datastore: this.datastore,
					});

					notesToPublish.push(publishFile);

					const blobs = await publishFile.getBlobLinks();

					blobs.forEach((i) => blobsToPublish.add(i));
				}
			} catch (e) {
				Logger.error(e);
			}
		}

		return {
			notes: notesToPublish.sort((a, b) => a.compare(b)),
			blobs: Array.from(blobsToPublish),
		};
	}

	/**
	 * Uploads a note to the repository.
	 *
	 * @deprecated Unused.
	 *
	 * @param vaultFilePath - The path of the note in the vault.
	 * @param sha - The SHA of the note, if it exists.
	 * @returns A promise that resolves to true if the upload was successful, false otherwise.
	 */
	async deleteNote(vaultFilePath: string, sha?: string) {
		if (
			this.settings.vaultPath !== "/" &&
			this.settings.vaultPath !== "" &&
			vaultFilePath.startsWith(this.settings.vaultPath)
		) {
			vaultFilePath = vaultFilePath.replace(this.settings.vaultPath, "");
		}

		return await this.delete(vaultFilePath, sha);
	}

	/**
	 * Deletes a blob from the repository.
	 *
	 * @deprecated Unused.
	 *
	 * @param vaultFilePath - The path of the blob in the vault.
	 * @param sha - The SHA of the blob, if it exists.
	 * @returns A promise that resolves to true if the deletion was successful, false otherwise.
	 */
	async deleteBlob(vaultFilePath: string, sha?: string) {
		if (
			this.settings.vaultPath !== "/" &&
			this.settings.vaultPath !== "" &&
			vaultFilePath.startsWith(this.settings.vaultPath)
		) {
			vaultFilePath = vaultFilePath.replace(this.settings.vaultPath, "");
		}

		return await this.delete(vaultFilePath, sha);
	}

	/**
	 * Deletes a file from the repository.
	 *
	 * @deprecated Unused.
	 *
	 * @param path - The path of the file to delete.
	 * @param sha - The SHA of the file, if it exists.
	 * @returns A promise that resolves to true if the deletion was successful, false otherwise.
	 */
	public async delete(path: string, sha?: string): Promise<boolean> {
		this.validateSettings();

		const userSyncerConnection = new RepositoryConnection({
			quartzRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
		});

		const deleted = await userSyncerConnection.deleteFile(path, {
			sha,
		});

		return !!deleted;
	}

	/**
	 * Publishes a file to the repository.
	 *
	 * @deprecated Unused.
	 *
	 * @param file - The file to publish.
	 * @returns A promise that resolves to true if the publish was successful, false otherwise.
	 */
	public async publish(file: CompiledPublishFile): Promise<boolean> {
		if (
			!isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				file.frontmatter,
			)
		) {
			return false;
		}

		try {
			const [text, assets] = file.compiledFile;
			await this.uploadText(file.getVaultPath(), text, file?.remoteHash);
			await this.uploadAssets(assets);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	/**
	 * Deletes a batch of files from the repository.
	 *
	 * @param filePaths - An array of file paths to delete.
	 * @returns A promise that resolves to true if the deletion was successful, false otherwise.
	 */
	public async deleteBatch(filePaths: string[]): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = new RepositoryConnection({
				quartzRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
				contentFolder: this.settings.contentFolder,
				vaultPath: this.settings.vaultPath,
			});

			await userQuartzConnection.deleteFiles(filePaths);

			if (this.settings.useCache) {
				// Update the remote files and hashes in the datastore
				for (const filePath of filePaths) {
					await this.datastore.dropFile(filePath);
				}
			}

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	/**
	 * Publishes a batch of files to the repository.
	 *
	 * @param files - An array of compiled publish files to publish.
	 * @returns A promise that resolves to true if the publish was successful, false otherwise.
	 */
	public async publishBatch(files: CompiledPublishFile[]): Promise<boolean> {
		const filesToPublish = files.filter((f) =>
			isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				f.frontmatter,
			),
		);

		if (filesToPublish.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = new RepositoryConnection({
				quartzRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
				contentFolder: this.settings.contentFolder,
				vaultPath: this.settings.vaultPath,
			});

			await userQuartzConnection.updateFiles(filesToPublish);

			if (this.settings.useCache) {
				// Update the remote files and hashes in the datastore
				for (const file of filesToPublish) {
					const data = await this.datastore.loadFile(file.file.path);

					if (data && data.localData) {
						await this.datastore.storeRemoteFile(
							file.file.path,
							file.file.stat.mtime,
							data.localData,
						);
					}
				}
			}

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	/**
	 * Uploads a file to GitHub.
	 *
	 * @param path - The path of the file in the repository.
	 * @param content - The content of the file to upload.
	 * @param remoteFileHash - The SHA of the file, if it exists.
	 * @returns A promise that resolves to the result of the upload operation.
	 */
	private async uploadToGithub(
		path: string,
		content: string,
		remoteFileHash?: string,
	) {
		this.validateSettings();
		let message = `Update content ${path}`;

		const userSyncerConnection = new RepositoryConnection({
			quartzRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
		});

		if (!remoteFileHash) {
			const file = await userSyncerConnection.getFile(path).catch(() => {
				// file does not exist
				Logger.info(`File ${path} does not exist, adding`);
			});
			remoteFileHash = file?.sha;

			if (!remoteFileHash) {
				message = `Add content ${path}`;
			}
		}

		return await userSyncerConnection.updateFile({
			content,
			path,
			message,
			sha: remoteFileHash,
		});
	}

	/**
	 * Uploads a text file to GitHub.
	 *
	 * @deprecated Unused.
	 *
	 * @param filePath - The path of the file in the repository.
	 * @param content - The content of the file to upload.
	 * @param sha - The SHA of the file, if it exists.
	 */
	private async uploadText(filePath: string, content: string, sha?: string) {
		content = Base64.encode(content);
		const path = `${this.settings.contentFolder}/${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	/**
	 * Uploads a blob to GitHub.
	 *
	 * @deprecated Unused.
	 *
	 * @param filePath - The path of the blob in the repository.
	 * @param content - The content of the blob to upload.
	 * @param sha - The SHA of the blob, if it exists.
	 */
	private async uploadBlob(filePath: string, content: string, sha?: string) {
		let previous;

		do {
			previous = filePath;
			filePath = filePath.replace(/\.\.\//g, "");
		} while (filePath !== previous);
		const actualFilePath = filePath;
		const path = `${this.settings.contentFolder}/${actualFilePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	/**
	 * Uploads assets to GitHub.
	 *
	 * @deprecated Unused.
	 *
	 * @param assets - The assets to upload.
	 */
	private async uploadAssets(assets: Assets) {
		for (let idx = 0; idx < assets.blobs.length; idx++) {
			const blob = assets.blobs[idx];
			await this.uploadBlob(blob.path, blob.content, blob.remoteHash);
		}
	}

	/**
	 * Validates the plugin settings.
	 *
	 * @throws shows a notice if any required setting is missing.
	 */
	validateSettings() {
		if (!this.settings.githubRepo) {
			new Notice(
				"Config error: You need to define a GitHub repo in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.githubUserName) {
			new Notice(
				"Config error: You need to define a GitHub Username in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.githubToken) {
			new Notice(
				"Config error: You need to define a GitHub Token in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.contentFolder) {
			new Notice(
				"Config error: You need to define a Content Folder in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.vaultPath) {
			new Notice(
				"Config error: You need to define a Vault Folder in the plugin settings",
			);
			throw {};
		}
	}
}
