import { Platform, type App } from "obsidian";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";
import type { FileChange } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import { PathMapper } from "src/git/PathMapper";
import { PublishFile } from "src/publishFile/PublishFile";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore, type CachedStatusMetadata } from "src/cache/DataStore";
import type {
	PublishFailure,
	PublishProgressCallback,
	PublishResult,
	PublishStatus,
} from "src/publisher/types";
import {
	buildRemoteIndex,
	classifyArbitrary,
	classifyRemoteOnly,
} from "src/publisher/PublishStatusManager";
import {
	flattenLinkedMedia,
	resolveLinkedMedia,
	resolveLinkedMediaByFile,
} from "src/publisher/MediaLinkResolver";
import type { CompilationQueue } from "src/services/CompilationQueue";
import { batchParallel, generateBlobHash } from "src/utils/utils";
import { V4_ARBITRARY_PUBLISH_BLOCKED } from "src/quartz/QuartzCompatibility";
import {
	AssetSyncer,
	type AssetSyncResult,
} from "src/compiler/integrations/AssetSyncer";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
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

	private collectCandidates(settings: QuartzSyncerSettings): PublishFile[] {
		const publishFiles: PublishFile[] = [];
		const useAllDefault = settings.allNotesPublishableByDefault;

		const candidatePaths = collectCandidatePaths(
			this.app,
			this.plugin,
			settings,
		);

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

		return publishFiles;
	}

	/**
	 * Collect integration stylesheets to publish alongside the notes.
	 *
	 * Gated on v5 because these paths live outside the content folder. The
	 * `quartz/styles` layout happens to be identical in v4 today, but writing
	 * there is only sanctioned for repositories we manage.
	 */
	private async collectIntegrationAssets(
		settings: QuartzSyncerSettings,
	): Promise<AssetSyncResult | null> {
		if (!(await this.plugin.quartzCompatibility.supportsV5Management())) {
			return null;
		}

		const repo = createRepositoryAdapter(this.plugin);

		if (!repo) return null;

		const result = await new AssetSyncer(settings).collectAssets(repo);

		return result.success ? result : null;
	}

	private async compileAndHashSingle(file: PublishFile): Promise<string> {
		const compiled = await file.compile(
			this.compilationQueue !== undefined,
		);
		const hash = await generateBlobHash(compiled.getCompiledFile()[0]);
		return hash;
	}

	private async resolveMediaLinksIncremental(
		files: PublishFile[],
		metadata: Map<string, CachedStatusMetadata>,
	): Promise<Map<string, string[]>> {
		const mediaLinks = new Map<string, string[]>();
		const concurrency = Platform.isMobileApp ? 2 : 5;

		await batchParallel(
			files,
			async (file) => {
				const cachedLinks = metadata.get(file.file.path)?.mediaLinks;
				const links = cachedLinks ?? (await file.getBlobLinks());

				if (links.length > 0) {
					mediaLinks.set(file.file.path, links);
				}

				return undefined;
			},
			concurrency,
		);

		return mediaLinks;
	}

	async getPublishStatus(): Promise<PublishStatus> {
		const settings = this.plugin.settings;
		const candidates = this.collectCandidates(settings);

		this.compilationQueue?.pause();

		try {
			const remoteTree = await this.backend.getCachedTree(
				settings.gitBranch,
			);
			const remoteIndex = buildRemoteIndex(remoteTree, this.pathMapper);

			const unpublished: PublishFile[] = [];
			const changed: PublishFile[] = [];
			const published: PublishFile[] = [];

			const remoteBacked: { file: PublishFile; sha: string }[] = [];

			for (const file of candidates) {
				const vaultPath = file.getVaultPath();
				const repoPath = this.pathMapper.toRepoPath(vaultPath);
				const remote = remoteIndex.content.get(repoPath);

				if (!remote) {
					unpublished.push(file);
					continue;
				}

				remoteBacked.push({ file, sha: remote.sha });
			}

			// One metadata pass serves both hash classification and media links.
			const metadata = settings.useCache
				? await this.dataStore.loadStatusMetadata(
						candidates.map(({ file }) => ({
							path: file.path,
							mtime: file.stat.mtime,
						})),
					)
				: new Map<string, CachedStatusMetadata>();
			const hashes = settings.useCache
				? remoteBacked.map(
						({ file }) => metadata.get(file.file.path)?.localHash,
					)
				: await batchParallel(
						remoteBacked,
						({ file }) => this.compileAndHashSingle(file),
						Platform.isMobileApp ? 1 : 2,
					);

			remoteBacked.forEach(({ file, sha }, index) => {
				const localHash = hashes[index];

				if (localHash && localHash === sha) {
					published.push(file);
				} else {
					changed.push(file);
				}
			});

			// Orphan detection and callers share the same cache-aware links.
			const mediaLinks = settings.useCache
				? await this.resolveMediaLinksIncremental(candidates, metadata)
				: await resolveLinkedMediaByFile(candidates);
			const linkedMedia = flattenLinkedMedia(mediaLinks);

			const { deleted, media } = classifyRemoteOnly(
				remoteIndex,
				candidates,
				this.pathMapper,
				linkedMedia,
			);

			const arbitrary = classifyArbitrary(
				remoteIndex,
				settings.allowArbitraryFilePublishing
					? settings.arbitraryPublishPaths
					: undefined,
			);

			return {
				unpublished,
				changed,
				published,
				deleted,
				media,
				arbitrary,
				mediaLinks,
			};
		} finally {
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
				true,
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

		const publishedFiles: PublishFile[] = [];
		const failures: PublishFailure[] = [];

		try {
			for (let index = 0; index < files.length; index += 1) {
				const file = files[index];
				if (!file) continue;

				// Staged per file so a failure midway cannot leave a partially
				// written note (text without its media) in the commit.
				const fileChanges: FileChange[] = [];

				try {
					let storedFile = settings.useCache
						? await this.dataStore.loadLocalFile(
								file.file.path,
								file.file.stat.mtime,
								true,
							)
						: null;

					if (!storedFile) {
						const compiled = await file.compile(true);
						storedFile = compiled.getCompiledFile();
					}

					const [text, assets] = storedFile;
					const repoPath = this.pathMapper.toRepoPath(
						file.getVaultPath(),
					);

					fileChanges.push({
						path: repoPath,
						content: text,
						encoding: "utf-8",
					});

					for (const asset of assets.blobs) {
						const assetPath = this.pathMapper.toRepoPath(
							this.toVaultRelativePath(asset.path),
						);

						fileChanges.push({
							path: assetPath,
							content: asset.content,
							encoding: "base64",
						});
					}

					const localHash = settings.useCache
						? await this.dataStore.loadLocalHash(
								file.file.path,
								file.file.stat.mtime,
							)
						: null;

					if (localHash) {
						remoteHashes.push({
							path: file.file.path,
							timestamp: now,
							hash: localHash,
						});
					}

					changes.push(...fileChanges);
					publishedFiles.push(file);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);

					failures.push({
						vaultPath: file.getVaultPath(),
						error: message,
					});

					this.eventSink?.emit("publish.file.failed", {
						path: file.getVaultPath(),
						error: message,
					});
				}

				onProgress?.(index + 1, total);
			}

			if (files.length > 0 && publishedFiles.length === 0) {
				this.eventSink?.emit("publish.failed", {
					error: `All ${failures.length} file(s) failed to compile`,
				});

				return {
					success: false,
					filesPublished: 0,
					filesDeleted: 0,
					error: `All ${failures.length} file(s) failed to compile. First error: ${failures[0]?.error ?? "Unknown error"}`,
					failures,
				};
			}

			const assets = await this.collectIntegrationAssets(settings);

			if (assets) {
				for (const [path, content] of assets.filesToStage) {
					changes.push({ path, content, encoding: "utf-8" });
				}
			}

			const result = await this.backend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

			if (assets && assets.filesToDelete.length > 0) {
				await this.backend.deleteFiles(
					settings.gitBranch,
					"Remove Quartz Syncer integration styles",
					assets.filesToDelete,
				);
			}

			this.eventSink?.emit("publish.completed", {
				fileCount: publishedFiles.length,
				failedCount: failures.length,
				commitSha: result.sha,
			});

			if (remoteHashes.length > 0) {
				await this.dataStore.storeRemoteHashes(remoteHashes);
			}

			this.backend.invalidateTreeCache();
			this.plugin.statusCache.patchPublished(
				new Set(publishedFiles.map((f) => f.getVaultPath())),
			);
			this.backend.refreshTreeCache().catch((error) => {
				console.debug("Tree cache refresh failed:", error);
				this.eventSink?.emit("tree.refresh.failed", {
					error:
						error instanceof Error ? error.message : String(error),
				});
			});

			const publishResult: PublishResult = {
				success: true,
				commitSha: result.sha,
				filesPublished: publishedFiles.length,
				filesDeleted: 0,
				...(failures.length > 0 ? { failures } : {}),
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
				...(failures.length > 0 ? { failures } : {}),
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
				this.eventSink?.emit("tree.refresh.failed", {
					error:
						error instanceof Error ? error.message : String(error),
				});
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
				this.eventSink?.emit("tree.refresh.failed", {
					error:
						error instanceof Error ? error.message : String(error),
				});
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

		// Arbitrary publishing is the only core path that bypasses PathMapper
		// and can therefore write outside the content folder.
		if (await this.plugin.quartzCompatibility.isConfirmedV4()) {
			return {
				success: false,
				filesPublished: 0,
				filesDeleted: 0,
				error: V4_ARBITRARY_PUBLISH_BLOCKED,
			};
		}

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
				this.eventSink?.emit("tree.refresh.failed", {
					error:
						error instanceof Error ? error.message : String(error),
				});
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
		const candidates = this.collectCandidates(settings);

		this.compilationQueue?.pause();

		try {
			const linkedMedia = await resolveLinkedMedia(candidates);
			const remoteTree = await this.backend.getCachedTree(
				settings.gitBranch,
			);
			const remoteIndex = buildRemoteIndex(remoteTree, this.pathMapper);
			const { media } = classifyRemoteOnly(
				remoteIndex,
				candidates,
				this.pathMapper,
				linkedMedia,
			);

			const totalMedia = media.length;
			const orphaned = media.filter((entry) => !entry.linked);

			if (totalMedia > 5 && orphaned.length > totalMedia * 0.8) {
				console.warn(
					`Skipping orphan cleanup: ${orphaned.length}/${totalMedia} media files appear orphaned (>80% threshold).`,
				);
				return null;
			}

			if (orphaned.length === 0) {
				return null;
			}

			const orphanedRepoPaths = orphaned.map((entry) => entry.repoPath);

			return await this.deleteByRepoPaths(
				orphanedRepoPaths,
				"Cleaned orphaned media",
			);
		} finally {
			this.compilationQueue?.resume();
		}
	}
}
