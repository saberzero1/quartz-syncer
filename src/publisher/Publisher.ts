import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { GitBackend, FileChange } from "src/git/types";
import { PathMapper } from "src/git/PathMapper";
import { PublishFile } from "src/publishFile/PublishFile";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore } from "src/cache/DataStore";
import type {
	PublishProgressCallback,
	PublishResult,
	PublishStatus,
} from "src/publisher/types";
import { categorizeFiles } from "src/publisher/PublishStatusManager";
import { resolveLinkedMedia } from "src/publisher/MediaLinkResolver";
import type { CompilationQueue } from "src/services/CompilationQueue";
import { RemoteTreeCache } from "src/git/RemoteTreeCache";
import { isMediaFile } from "src/utils/mediaTypes";

export class Publisher {
	private pathMapper: PathMapper;
	readonly remoteTreeCache: RemoteTreeCache;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private gitBackend: GitBackend,
		private compiler: SyncerPageCompiler,
		private dataStore: DataStore,
		private compilationQueue?: CompilationQueue,
	) {
		this.pathMapper = new PathMapper(plugin.settings.contentFolder);
		this.remoteTreeCache = new RemoteTreeCache(
			gitBackend,
			plugin.settings.gitBranch,
		);
	}

	async getPublishStatus(): Promise<PublishStatus> {
		const settings = this.plugin.settings;
		const vaultFiles = this.app.vault.getFiles();
		const publishFiles: PublishFile[] = [];

		for (const file of vaultFiles) {
			const publishFile = new PublishFile({
				file,
				compiler: this.compiler,
				metadataCache: this.app.metadataCache,
				vault: this.app.vault,
				settings,
				datastore: this.dataStore,
			});

			if (publishFile.shouldPublish()) {
				publishFiles.push(publishFile);
			}
		}

		this.compilationQueue?.pause();

		if (settings.useCache) {
			await this.dataStore.preloadCache();
		}

		try {
			const compiledFiles: PublishFile[] = [];
			const trustDynamic = this.compilationQueue !== undefined;

			for (const file of publishFiles) {
				const compiled = await file.compile(trustDynamic);
				compiledFiles.push(compiled);
			}

			const remoteTree = await this.remoteTreeCache.get();
			const linkedMedia = await resolveLinkedMedia(compiledFiles);

			return await categorizeFiles(
				compiledFiles,
				remoteTree,
				this.dataStore,
				this.pathMapper,
				linkedMedia,
				settings.allowArbitraryFilePublishing
					? settings.arbitraryPublishPaths
					: undefined,
			);
		} finally {
			if (settings.useCache) {
				await this.dataStore.flushCache();
				this.dataStore.clearMemoryCache();
			}

			this.compilationQueue?.resume();
		}
	}

	async getRemoteFileContent(vaultPath: string): Promise<string | null> {
		try {
			const repoPath = this.pathMapper.toRepoPath(
				this.toVaultRelativePath(vaultPath),
			);
			const tree = await this.remoteTreeCache.get();
			const entry = tree.find(
				(item) => item.path === repoPath && item.type === "blob",
			);

			if (!entry) return null;

			const blob = await this.gitBackend.readBlob(entry.sha);

			return new TextDecoder().decode(blob);
		} catch {
			return null;
		}
	}

	async getLocalCompiledContent(file: PublishFile): Promise<string | null> {
		try {
			const compiled = await this.dataStore.loadLocalFile(
				file.file.path,
				file.file.stat.mtime,
			);

			if (!compiled) return null;

			return compiled[0];
		} catch {
			return null;
		}
	}

	async publishBatch(
		files: PublishFile[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const changes: FileChange[] = [];
		const now = Date.now();
		const commitMessage = message ?? "Publish notes";
		const total = files.length;

		try {
			for (let index = 0; index < files.length; index += 1) {
				const file = files[index];
				if (!file) continue;

				const compiled = await this.dataStore.loadLocalFile(
					file.file.path,
					file.file.stat.mtime,
				);

				if (!compiled) {
					throw new Error(
						`Missing cached content for ${file.file.path}`,
					);
				}

				const [text, assets] = compiled;
				const repoPath = this.pathMapper.toRepoPath(
					file.getVaultPath(),
				);

				changes.push({
					path: repoPath,
					content: text,
					encoding: "utf-8",
				});

				for (const asset of assets.blobs) {
					const assetPath = this.pathMapper.toRepoPath(
						this.toVaultRelativePath(asset.path),
					);

					changes.push({
						path: assetPath,
						content: asset.content,
						encoding: "base64",
					});
				}

				const localHash = await this.dataStore.loadLocalHash(
					file.file.path,
					file.file.stat.mtime,
				);

				if (localHash) {
					await this.dataStore.storeRemoteHash(
						file.file.path,
						now,
						localHash,
					);
				}

				onProgress?.(index + 1, total);
			}

			const result = await this.gitBackend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

			this.remoteTreeCache.invalidate();
			void this.remoteTreeCache.refresh();

			const publishResult: PublishResult = {
				success: true,
				commitSha: result.sha,
				filesPublished: files.length,
				filesDeleted: 0,
			};

			if (settings.autoCleanOrphanedMedia) {
				const cleanResult = await this.cleanOrphanedMedia();
				if (cleanResult && !cleanResult.success) {
					console.debug(
						"Auto-clean orphaned media failed:",
						cleanResult.error ?? "Unknown error",
					);
				}
			}

			return publishResult;
		} catch (error) {
			return {
				success: false,
				filesPublished: 0,
				filesDeleted: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async deleteBatch(
		paths: string[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const repoPaths = paths.map((path) =>
			this.pathMapper.toRepoPath(this.toVaultRelativePath(path)),
		);
		const commitMessage = message ?? "Delete notes";
		const total = paths.length;

		try {
			const result = await this.gitBackend.deleteFiles(
				settings.gitBranch,
				commitMessage,
				repoPaths,
			);

			for (let index = 0; index < paths.length; index += 1) {
				const path = paths[index];
				if (!path) continue;
				await this.dataStore.dropFile(path);
				onProgress?.(index + 1, total);
			}

			this.remoteTreeCache.invalidate();
			void this.remoteTreeCache.refresh();

			const deleteResult: PublishResult = {
				success: true,
				commitSha: result.sha,
				filesPublished: 0,
				filesDeleted: paths.length,
			};

			if (settings.autoCleanOrphanedMedia) {
				const cleanResult = await this.cleanOrphanedMedia();
				if (cleanResult && !cleanResult.success) {
					console.debug(
						"Auto-clean orphaned media failed:",
						cleanResult.error ?? "Unknown error",
					);
				}
			}

			return deleteResult;
		} catch (error) {
			return {
				success: false,
				filesPublished: 0,
				filesDeleted: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private toVaultRelativePath(path: string): string {
		const vaultPath = this.plugin.settings.vaultPath;
		if (vaultPath !== "/" && path.startsWith(vaultPath)) {
			return path.replace(vaultPath, "");
		}
		return path;
	}

	async deleteByRepoPaths(
		repoPaths: string[],
		message?: string,
		onProgress?: PublishProgressCallback,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const commitMessage = message ?? "Delete notes";
		const total = repoPaths.length;

		try {
			const result = await this.gitBackend.deleteFiles(
				settings.gitBranch,
				commitMessage,
				repoPaths,
			);

			for (let index = 0; index < repoPaths.length; index += 1) {
				onProgress?.(index + 1, total);
			}

			this.remoteTreeCache.invalidate();
			void this.remoteTreeCache.refresh();

			return {
				success: true,
				commitSha: result.sha,
				filesPublished: 0,
				filesDeleted: repoPaths.length,
			};
		} catch (error) {
			return {
				success: false,
				filesPublished: 0,
				filesDeleted: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async publishArbitraryFiles(
		files: Array<{
			repoPath: string;
			content: string | Uint8Array;
			encoding: "utf-8" | "base64";
		}>,
		message?: string,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const commitMessage = message ?? "Publish files";
		const changes: FileChange[] = files.map((file) => ({
			path: file.repoPath,
			content: file.content,
			encoding: file.encoding,
		}));

		try {
			const result = await this.gitBackend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

			this.remoteTreeCache.invalidate();
			void this.remoteTreeCache.refresh();

			return {
				success: true,
				commitSha: result.sha,
				filesPublished: files.length,
				filesDeleted: 0,
			};
		} catch (error) {
			return {
				success: false,
				filesPublished: 0,
				filesDeleted: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async cleanOrphanedMedia(): Promise<PublishResult | null> {
		const settings = this.plugin.settings;
		const vaultFiles = this.app.vault.getFiles();
		const publishFiles: PublishFile[] = [];

		for (const file of vaultFiles) {
			const publishFile = new PublishFile({
				file,
				compiler: this.compiler,
				metadataCache: this.app.metadataCache,
				vault: this.app.vault,
				settings,
				datastore: this.dataStore,
			});

			if (publishFile.shouldPublish()) {
				publishFiles.push(publishFile);
			}
		}

		this.compilationQueue?.pause();

		if (settings.useCache) {
			await this.dataStore.preloadCache();
		}

		try {
			const compiledFiles: PublishFile[] = [];
			const trustDynamic = this.compilationQueue !== undefined;

			for (const file of publishFiles) {
				const compiled = await file.compile(trustDynamic);
				compiledFiles.push(compiled);
			}

			const linkedMedia = await resolveLinkedMedia(compiledFiles);
			const remoteTree = await this.remoteTreeCache.get();
			const orphanedRepoPaths: string[] = [];

			for (const entry of remoteTree) {
				if (entry.type !== "blob") continue;
				if (!this.pathMapper.isInContentFolder(entry.path)) continue;
				if (!isMediaFile(entry.path)) continue;
				const vaultPath = this.pathMapper.toVaultPath(entry.path);
				if (!linkedMedia.has(vaultPath)) {
					orphanedRepoPaths.push(entry.path);
				}
			}

			if (orphanedRepoPaths.length === 0) {
				return null;
			}

			return await this.deleteByRepoPaths(
				orphanedRepoPaths,
				"Cleaned orphaned media",
			);
		} finally {
			if (settings.useCache) {
				await this.dataStore.flushCache();
				this.dataStore.clearMemoryCache();
			}

			this.compilationQueue?.resume();
		}
	}
}
