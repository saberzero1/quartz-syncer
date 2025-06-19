import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "src/publisher/Publisher";
import { generateBlobHash } from "src/utils/utils";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { LoadingController } from "src/models/ProgressBar";

/**
 * PublishStatusManager class.
 * Manages the publishing status of notes and blobs for a digital garden.
 */
export default class PublishStatusManager implements IPublishStatusManager {
	siteManager: QuartzSyncerSiteManager;
	publisher: Publisher;

	constructor(siteManager: QuartzSyncerSiteManager, publisher: Publisher) {
		this.siteManager = siteManager;
		this.publisher = publisher;
	}

	/**
	 * Gets the paths of deleted notes.
	 *
	 * @returns A promise that resolves to an array of deleted note paths.
	 */
	getDeletedNotePaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Gets the paths of deleted blobs.
	 *
	 * @returns A promise that resolves to an array of deleted blob paths.
	 */
	getDeletedBlobsPaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Generates paths for deleted content based on remote hashes and marked files.
	 *
	 * @param remoteNoteHashes - The hashes of remote notes.
	 * @param marked - The list of marked files.
	 * @returns An array of objects containing the path and SHA of deleted content.
	 */
	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<PathToRemove> {
		const isJsFile = (key: string) => key.endsWith(".js");

		const isMarkedForPublish = (key: string) =>
			marked.find((f) => f === key);

		const deletedPaths = Object.keys(remoteNoteHashes).filter(
			(key) => !isJsFile(key) && !isMarkedForPublish(key),
		);

		const pathsWithSha = deletedPaths.map((path) => {
			return {
				path,
				sha: remoteNoteHashes[path],
			};
		});

		return pathsWithSha;
	}

	/**
	 * Gets the current publish status, including unpublished, published, changed notes,
	 * and deleted note and blob paths.
	 *
	 * @param controller - The loading controller to manage the loading state.
	 * @returns A promise that resolves to an object containing the publish status.
	 */
	async getPublishStatus(
		controller: LoadingController,
	): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];
		const deletedNotePaths: Array<PathToRemove> = [];
		const deletedBlobPaths: Array<PathToRemove> = [];

		if (controller) {
			controller.setText("Retrieving publish status...");
			controller.setProgress(0);
		}

		const contentTree =
			await this.siteManager.userSyncerConnection.getContent("HEAD");

		if (!contentTree) {
			throw new Error("Could not get content tree from base garden");
		}

		const remoteNoteHashes =
			await this.siteManager.getNoteHashes(contentTree);

		const remoteBlobHashes =
			await this.siteManager.getBlobHashes(contentTree);

		const remoteBlobHashesArray = Object.entries(remoteBlobHashes);

		const numberOfEntries = Object.entries(remoteNoteHashes).length;
		const padLength = numberOfEntries.toString().length;
		let index = 0;

		if (this.publisher.settings.useCache) {
			// Check remote cache and update if needed
			for (const [path, sha] of remoteBlobHashesArray) {
				if (!sha) {
					continue;
				}

				const hash =
					await this.publisher.datastore.loadRemoteHash(path);

				if ((!hash || hash !== sha) && path.endsWith(".md")) {
					if (controller) {
						index++;

						controller.setProgress(
							Math.floor((index / numberOfEntries) * 100),
						);

						controller.setIndexText(
							`Notes processed: ${index.toString().padStart(padLength)}/${numberOfEntries}`,
						);

						controller.setText(`Processing ${path}...`);
					}

					// Check if file exists in Obsidian vault
					if (!this.publisher.vault.getFileByPath(path)) {
						continue;
					}

					const remoteContent =
						await this.siteManager.getNoteContent(path);

					if (!remoteContent) {
						continue;
					}

					const timestamp =
						(await this.publisher.datastore.getTime(path)) ??
						Date.now();

					await this.publisher.datastore.storeRemoteFile(
						path,
						timestamp,
						[remoteContent, { blobs: [] }],
					);

					await this.publisher.datastore.storeRemoteHash(
						path,
						timestamp,
						sha,
					);
				}
			}
		}

		if (controller) {
			controller.setText("Finishing up...");
			controller.setProgress(100);
		}

		const marked = await this.publisher.getFilesMarkedForPublishing();

		if (this.publisher.settings.useCache) {
			// Drop deleted blobs from cache
			await this.publisher.datastore.synchronize(
				marked["notes"].map((f) => f.getPath()),
			);

			if (this.publisher.settings.syncCache) {
				// Check if shared cache needs to be updated
				await this.publisher.plugin.compareDataToCache();
			}
		}

		for (const file of marked.notes) {
			const compiledFile = await file.compile();
			const [content, _] = compiledFile.getCompiledFile();

			const localHash = generateBlobHash(content);
			const remoteHash = remoteNoteHashes[file.getVaultPath()];

			if (!remoteHash) {
				unpublishedNotes.push(compiledFile);
			} else if (remoteHash === localHash) {
				compiledFile.setRemoteHash(remoteHash);
				publishedNotes.push(compiledFile);
			} else {
				compiledFile.setRemoteHash(remoteHash);
				changedNotes.push(compiledFile);
			}
		}

		deletedNotePaths.push(
			...this.generateDeletedContentPaths(
				remoteNoteHashes,
				marked.notes.map((f) => f.getVaultPath()),
			),
		);

		deletedBlobPaths.push(
			...this.generateDeletedContentPaths(remoteBlobHashes, marked.blobs),
		);

		// These might already be sorted, as getFilesMarkedForPublishing sorts already
		publishedNotes.sort((a, b) => a.compare(b));
		publishedNotes.sort((a, b) => a.compare(b));
		changedNotes.sort((a, b) => a.compare(b));
		deletedNotePaths.sort((a, b) => a.path.localeCompare(b.path));

		return {
			unpublishedNotes,
			publishedNotes,
			changedNotes,
			deletedNotePaths,
			deletedBlobPaths,
		};
	}
}

/**
 * PathToRemove interface.
 * Represents a path and its SHA for deleted content.
 */
interface PathToRemove {
	path: string;
	sha: string;
}

/**
 * PublishStatus interface.
 * Represents the status of published notes, including unpublished, published, changed notes, and deleted note and blob paths.
 */
export interface PublishStatus {
	unpublishedNotes: Array<CompiledPublishFile>;
	publishedNotes: Array<CompiledPublishFile>;
	changedNotes: Array<CompiledPublishFile>;
	deletedNotePaths: Array<PathToRemove>;
	deletedBlobPaths: Array<PathToRemove>;
}

/**
 * IPublishStatusManager interface.
 * Defines the methods for managing publish status.
 */
export interface IPublishStatusManager {
	getPublishStatus(controller: LoadingController): Promise<PublishStatus>;
}
