import { App, MetadataCache, TFile, Vault } from "obsidian";
import { getRewriteRules } from "src/utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "src/publishFile/Validator";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "src/models/settings";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { CompiledPublishFile, PublishFile } from "src/publishFile/PublishFile";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { DataStore } from "src/publishFile/DataStore";
import QuartzSyncer from "main";
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
	plugin: QuartzSyncer;
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: SyncerPageCompiler;
	settings: QuartzSyncerSettings;
	rewriteRule: PathRewriteRule;
	vaultPath: string;
	datastore: DataStore;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		vault: Vault,
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
		datastore: DataStore,
	) {
		this.app = app;
		this.plugin = plugin;
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

		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			frontMatter,
			this.settings.allNotesPublishableByDefault,
		);
	}

	/**
	 * Gets the files that are marked for publishing.
	 *
	 * @returns A promise that resolves to an object containing notes and blobs to be published.
	 */
	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const vaultIsRoot = this.settings.vaultPath == "/";

		// Only include files that are within the vaultPath
		const files = this.vault
			.getMarkdownFiles()
			.filter(
				(file: TFile) =>
					vaultIsRoot ||
					file.path.startsWith(this.settings.vaultPath),
			);

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
				this.settings.allNotesPublishableByDefault,
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
}
