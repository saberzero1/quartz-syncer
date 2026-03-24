import { App, MetadataCache, TFile, Vault } from "obsidian";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "src/publishFile/Validator";
import QuartzSyncerSettings from "src/models/settings";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { CompiledPublishFile, PublishFile } from "src/publishFile/PublishFile";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { DataStore } from "src/publishFile/DataStore";
import { AssetSyncer } from "src/compiler/integrations";
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
		this.vaultPath = settings.vaultPath;
		this.datastore = datastore;

		this.compiler = new SyncerPageCompiler(
			app,
			vault,
			settings,
			metadataCache,
			datastore,
		);
	}

	/**
	 * Checks if the file should be published based on its frontmatter.
	 *
	 * @param file - The file to check.
	 * @returns true if the file should be published, false otherwise.
	 */
	shouldPublish(file: TFile): boolean {
		if (file.extension === "base") {
			return this.settings.useBases;
		}

		if (file.extension === "canvas") {
			return this.settings.useCanvas;
		}

		if (
			file.path.endsWith(".excalidraw") ||
			file.path.endsWith(".excalidraw.md")
		) {
			return this.settings.useExcalidraw;
		}

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
		const vaultIsRoot = this.settings.vaultPath === "/";

		const markdownFiles = this.vault
			.getMarkdownFiles()
			.filter(
				(file: TFile) =>
					vaultIsRoot ||
					file.path.startsWith(this.settings.vaultPath),
			);

		const baseFiles = this.settings.useBases
			? this.vault
					.getFiles()
					.filter(
						(file: TFile) =>
							file.extension === "base" &&
							(vaultIsRoot ||
								file.path.startsWith(this.settings.vaultPath)),
					)
			: [];

		const canvasFiles = this.settings.useCanvas
			? this.vault
					.getFiles()
					.filter(
						(file: TFile) =>
							file.extension === "canvas" &&
							(vaultIsRoot ||
								file.path.startsWith(this.settings.vaultPath)),
					)
			: [];

		const files = [...markdownFiles, ...baseFiles, ...canvasFiles];

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
	 * Creates a RepositoryConnection that can be shared across operations.
	 * Reusing a connection avoids redundant clone/fetch cycles.
	 */
	public createConnection(): RepositoryConnection {
		return new RepositoryConnection({
			gitSettings: this.plugin.getGitSettingsWithSecret(),
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
		});
	}

	/**
	 * Deletes a batch of files from the repository.
	 *
	 * @param filePaths - An array of file paths to delete.
	 * @param connection - Optional shared RepositoryConnection to reuse.
	 * @returns A promise that resolves to true if the deletion was successful, false otherwise.
	 */
	public async deleteBatch(
		filePaths: string[],
		connection?: RepositoryConnection,
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = connection ?? this.createConnection();

			await userQuartzConnection.deleteFiles(filePaths, onProgress);

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

	public async publishBatch(
		files: CompiledPublishFile[],
		connection?: RepositoryConnection,
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<boolean> {
		const filesToPublish = files.filter((f) => {
			if (f.file.extension === "base") {
				return this.settings.useBases;
			}

			if (f.file.extension === "canvas") {
				return this.settings.useCanvas;
			}

			return isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				f.frontmatter,
				this.settings.allNotesPublishableByDefault,
			);
		});

		if (filesToPublish.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = connection ?? this.createConnection();

			const assetSyncer = new AssetSyncer(this.settings);

			const assetResult =
				await assetSyncer.collectAssets(userQuartzConnection);

			await userQuartzConnection.updateFiles(
				filesToPublish,
				assetResult.filesToStage,
				assetResult.filesToDelete,
				onProgress,
			);

			if (this.settings.useCache) {
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
