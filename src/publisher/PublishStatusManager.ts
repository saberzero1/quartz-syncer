import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "src/publisher/Publisher";
import { generateBlobHash } from "src/utils/utils";
import { CompiledPublishFile } from "src/publishFile/PublishFile";

/**
 *  Manages the publishing status of notes and blobs for a digital garden.
 */
export default class PublishStatusManager implements IPublishStatusManager {
	siteManager: QuartzSyncerSiteManager;
	publisher: Publisher;

	constructor(siteManager: QuartzSyncerSiteManager, publisher: Publisher) {
		this.siteManager = siteManager;
		this.publisher = publisher;
	}

	getDeletedNotePaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	getDeletedBlobsPaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<{ path: string; sha: string }> {
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

	async getPublishStatus(): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];

		const contentTree =
			await this.siteManager.userSyncerConnection.getContent("HEAD");

		if (!contentTree) {
			throw new Error("Could not get content tree from base garden");
		}

		const remoteNoteHashes =
			await this.siteManager.getNoteHashes(contentTree);

		const remoteBlobHashes =
			await this.siteManager.getBlobHashes(contentTree);

		if (this.publisher.settings.useCache) {
			// Check remote cache and update if needed
			for (const [path, sha] of Object.entries(remoteBlobHashes)) {
				if (!sha) {
					continue;
				}

				//const notePath = path.startsWith(this.settings.vaultPath) ? path.slict(this.settings.vaultPath.length + 1) : path;

				const hash =
					await this.publisher.datastore.loadRemoteHash(path);

				if (!hash || hash !== sha) {
					// Check if file exists in Obsidian vault
					if (!this.publisher.vault.getAbstractFileByPath(path)) {
						continue;
					}

					// If the hash is different, update the remote file

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

		const marked = await this.publisher.getFilesMarkedForPublishing();

		if (this.publisher.settings.useCache) {
			// Drop deleted blobs from cache
			await this.publisher.datastore.synchronize(
				marked["notes"].map((f) => f.getPath()),
			);
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

		const deletedNotePaths = this.generateDeletedContentPaths(
			remoteNoteHashes,
			marked.notes.map((f) => f.getVaultPath()),
		);

		const deletedBlobPaths = this.generateDeletedContentPaths(
			remoteBlobHashes,
			marked.blobs,
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

interface PathToRemove {
	path: string;
	sha: string;
}

export interface PublishStatus {
	unpublishedNotes: Array<CompiledPublishFile>;
	publishedNotes: Array<CompiledPublishFile>;
	changedNotes: Array<CompiledPublishFile>;
	deletedNotePaths: Array<PathToRemove>;
	deletedBlobPaths: Array<PathToRemove>;
}

export interface IPublishStatusManager {
	getPublishStatus(): Promise<PublishStatus>;
}
