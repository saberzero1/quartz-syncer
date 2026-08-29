import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { FileChange } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import { PathMapper } from "src/git/PathMapper";
import { getSpecialFileType, PublishFile } from "src/publishFile/PublishFile";
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
import { isMediaFile } from "src/utils/mediaTypes";
import type { IOperabilityEventSink } from "src/operability/types";

export class Publisher {
	private pathMapper: PathMapper;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private backend: PublishBackend,
		private compiler: SyncerPageCompiler,
		private dataStore: DataStore,
		private compilationQueue?: CompilationQueue,
		private eventSink?: IOperabilityEventSink,
	) {
		this.pathMapper = new PathMapper(plugin.settings.contentFolder);
	}

	get isLocal(): boolean {
		return this.backend.isLocal;
	}

	startPeriodicFetch(intervalSeconds: number): void {
		this.backend.startPeriodicFetch(intervalSeconds);
	}

	stopPeriodicFetch(): void {
		this.backend.stopPeriodicFetch();
	}

	async refreshTreeCache(): Promise<void> {
		await this.backend.refreshTreeCache();
	}

	async getCachedTree(): Promise<import("src/git/types").TreeEntry[] | null> {
		try {
			return await this.backend.getCachedTree(
				this.plugin.settings.gitBranch,
			);
		} catch {
			return null;
		}
	}

	getPathMapper(): PathMapper {
		return this.pathMapper;
	}

	async getPublishStatus(): Promise<PublishStatus> {
		const settings = this.plugin.settings;
		const vaultFiles = this.app.vault.getFiles();
		const publishFiles: PublishFile[] = [];

		const extCache = this.plugin.cacheHandle?.api;
		const useAllDefault = settings.allNotesPublishableByDefault;

		// Determine candidate file paths.
		// When allNotesPublishableByDefault is true, ALL vault files are
		// candidates — matching the current Validator.ts behavior where
		// override=true bypasses the frontmatter check entirely.
		// The fast-path (inverse-index lookup) only applies when
		// allNotesPublishableByDefault is false (the default).
		let candidatePaths: Set<string>;

		if (useAllDefault) {
			candidatePaths = new Set(vaultFiles.map((f) => f.path));
		} else if (extCache?.isReady) {
			candidatePaths = new Set(
				extCache.getFilesWithFrontmatterValue(
					settings.publishFrontmatterKey,
					true,
				),
			);

			for (const f of vaultFiles) {
				const type = getSpecialFileType(f);

				if (type === "base" && settings.useBases) {
					candidatePaths.add(f.path);
				} else if (type === "canvas" && settings.useCanvas) {
					candidatePaths.add(f.path);
				} else if (type === "excalidraw" && settings.useExcalidraw) {
					candidatePaths.add(f.path);
				}
			}
		} else {
			candidatePaths = new Set(vaultFiles.map((f) => f.path));
		}

		for (const path of candidatePaths) {
			const file = this.app.vault.getFileByPath(path);

			if (!file) continue;

			const publishFile = new PublishFile({
				file,
				compiler: this.compiler,
				metadataCache: this.app.metadataCache,
				vault: this.app.vault,
				settings,
				datastore: this.dataStore,
			});

			if (useAllDefault || publishFile.shouldPublish()) {
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

			const remoteTree = await this.backend.getCachedTree(
				settings.gitBranch,
			);
			const linkedMedia = await resolveLinkedMedia(compiledFiles);

			const mediaLinks = new Map<string, string[]>();

			for (const file of compiledFiles) {
				const links = await this.dataStore.loadMediaLinks(
					file.file.path,
				);

				if (links.length > 0) {
					mediaLinks.set(file.file.path, links);
				}
			}

			const status = await categorizeFiles(
				compiledFiles,
				remoteTree,
				this.dataStore,
				this.pathMapper,
				linkedMedia,
				settings.allowArbitraryFilePublishing
					? settings.arbitraryPublishPaths
					: undefined,
			);

			status.mediaLinks = mediaLinks;

			return status;
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
			const tree = await this.backend.getCachedTree(
				this.plugin.settings.gitBranch,
			);
			const entry = tree.find(
				(item) => item.path === repoPath && item.type === "blob",
			);

			if (!entry) return null;

			const blob = this.backend.isLocal
				? await this.backend.readBlob(repoPath)
				: await this.backend.readBlob(entry.sha);

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
		this.eventSink?.emit("publish.started", { fileCount: files.length });
		const settings = this.plugin.settings;
		const changes: FileChange[] = [];
		const remoteHashes: Array<{
			path: string;
			timestamp: number;
			hash: string;
		}> = [];
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
					remoteHashes.push({
						path: file.file.path,
						timestamp: now,
						hash: localHash,
					});
				}

				onProgress?.(index + 1, total);
			}

			const result = await this.backend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);
			this.eventSink?.emit("publish.completed", {
				fileCount: files.length,
				commitSha: result.sha,
			});

			for (const entry of remoteHashes) {
				await this.dataStore.storeRemoteHash(
					entry.path,
					entry.timestamp,
					entry.hash,
				);
			}

			this.backend.invalidateTreeCache();
			this.plugin.statusCache.patchPublished(
				new Set(files.map((f) => f.getVaultPath())),
			);
			this.backend.refreshTreeCache().catch((error) => {
				console.debug("Tree cache refresh failed:", error);
			});

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
			this.eventSink?.emit("publish.failed", {
				error: error instanceof Error ? error.message : String(error),
			});
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
		this.eventSink?.emit("delete.started", { fileCount: paths.length });
		const settings = this.plugin.settings;
		const repoPaths = paths.map((path) =>
			this.pathMapper.toRepoPath(this.toVaultRelativePath(path)),
		);
		const commitMessage = message ?? "Delete notes";
		const total = paths.length;

		try {
			const result = await this.backend.deleteFiles(
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

			if (this.backend instanceof RemotePublishBackend) {
				this.backend.removeTreeEntries(repoPaths);
			} else {
				this.backend.invalidateTreeCache();
			}
			this.plugin.statusCache.patchDeleted(new Set(paths));
			this.backend.refreshTreeCache().catch((error) => {
				console.debug("Tree cache refresh failed:", error);
			});

			this.eventSink?.emit("delete.completed", {
				fileCount: paths.length,
				commitSha: result.sha,
			});

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
			this.eventSink?.emit("delete.failed", {
				error: error instanceof Error ? error.message : String(error),
			});
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
		this.eventSink?.emit("delete.started", {
			fileCount: repoPaths.length,
		});
		const settings = this.plugin.settings;
		const commitMessage = message ?? "Delete notes";
		const total = repoPaths.length;

		try {
			const result = await this.backend.deleteFiles(
				settings.gitBranch,
				commitMessage,
				repoPaths,
			);

			for (const repoPath of repoPaths) {
				const vaultPath = this.pathMapper.toVaultPath(repoPath);
				await this.dataStore.dropFile(vaultPath);
			}

			for (let index = 0; index < repoPaths.length; index += 1) {
				onProgress?.(index + 1, total);
			}

			this.backend.invalidateTreeCache();
			this.plugin.statusCache.invalidate();
			this.backend.refreshTreeCache().catch((error) => {
				console.debug("Tree cache refresh failed:", error);
			});

			this.eventSink?.emit("delete.completed", {
				fileCount: repoPaths.length,
				commitSha: result.sha,
			});

			return {
				success: true,
				commitSha: result.sha,
				filesPublished: 0,
				filesDeleted: repoPaths.length,
			};
		} catch (error) {
			this.eventSink?.emit("delete.failed", {
				error: error instanceof Error ? error.message : String(error),
			});
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
			const result = await this.backend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

			this.backend.invalidateTreeCache();
			this.plugin.statusCache.invalidate();
			this.backend.refreshTreeCache().catch((error) => {
				console.debug("Tree cache refresh failed:", error);
			});

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
			const remoteTree = await this.backend.getCachedTree(
				settings.gitBranch,
			);
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
