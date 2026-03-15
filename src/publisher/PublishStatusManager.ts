import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "src/publisher/Publisher";
import { generateBlobHash, batchParallel } from "src/utils/utils";
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

	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<PathToRemove> {
		const markedSet = new Set(marked);
		const isJsFile = (key: string) => key.endsWith(".js");

		const isMarkedForPublish = (key: string) => markedSet.has(key);

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

		if (this.publisher.settings.useCache) {
			// Bulk-preload all IndexedDB entries into memory before the sync loop.
			// This eliminates per-file async IndexedDB round-trips.
			await this.publisher.datastore.preloadCache();
			// Check remote cache and update if needed
			// Filter to items that actually need processing, then batch-parallelize
			const entriesToProcess = remoteBlobHashesArray.filter(
				([path, sha]) => {
					if (!sha) return false;

					const isPublishableFile =
						path.endsWith(".md") ||
						(this.publisher.settings.useBases &&
							path.endsWith(".base")) ||
						(this.publisher.settings.useCanvas &&
							path.endsWith(".canvas"));

					return isPublishableFile;
				},
			);

			const syncTotal = entriesToProcess.length;
			const syncPadLength = syncTotal.toString().length;
			let syncIndex = 0;

			const allNoteContents = await this.siteManager.getAllNoteContents();

			await batchParallel(
				entriesToProcess,
				async ([path, sha]) => {
					syncIndex++;

					if (controller) {
						controller.setProgress(
							Math.floor((syncIndex / syncTotal) * 100),
						);

						controller.setIndexText(
							`Syncing remote cache: ${syncIndex.toString().padStart(syncPadLength)}/${syncTotal}`,
						);

						controller.setText(`Processing ${path}...`);
					}

					const hash =
						await this.publisher.datastore.loadRemoteHash(path);

					if (hash && hash === sha) {
						return;
					}

					// Check if file exists in Obsidian vault
					if (!this.publisher.vault.getFileByPath(path)) {
						return;
					}

					const remoteContent = allNoteContents.get(path) ?? "";

					if (!remoteContent) {
						return;
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
				},
				10,
			);

			if (controller) {
				controller.setText("Syncing cache to disk...");
				controller.setProgress(0);
			}

			await this.publisher.datastore.flushCache(controller);
		}

		if (controller) {
			controller.setText("Loading published notes...");
			controller.setProgress(100);
		}

		const marked = await this.publisher.getFilesMarkedForPublishing();

		if (this.publisher.settings.useCache) {
			await this.publisher.datastore.synchronize(
				marked["notes"].map((f) => f.getPath()),
			);

			if (this.publisher.settings.syncCache) {
				await this.publisher.plugin.compareDataToCache();
			}
		}

		// Populate the compiler's publish file cache before compiling all notes.
		// This avoids redundant O(N) vault scans during transclusion resolution.
		await this.publisher.compiler.cacheFilesMarkedForPublishing();
		if (controller) {
			controller.setText("Compiling notes...");
			controller.setProgress(0);
		}

		const compileTotal = marked.notes.length;
		const compilePadLength = compileTotal.toString().length;
		let compileIndex = 0;

		try {
			await batchParallel(
				marked.notes,
				async (file) => {
					compileIndex++;

					if (controller) {
						controller.setProgress(
							Math.floor((compileIndex / compileTotal) * 100),
						);

						controller.setIndexText(
							`Compiling: ${compileIndex.toString().padStart(compilePadLength)}/${compileTotal}`,
						);

						controller.setText(
							`Compiling ${file.getVaultPath()}...`,
						);
					}

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
				},
				10,
			);
		} finally {
			// Flush deferred IndexedDB writes from the compile loop,
			// then clear caches. Always runs even on error to avoid stale data.
			if (controller) {
				controller.setText("Saving compiled cache to disk...");
				controller.setProgress(0);
			}

			await this.publisher.datastore.flushCache(controller);

			this.publisher.compiler.clearPublishCache();
			this.publisher.datastore.clearMemoryCache();
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
