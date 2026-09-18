import { arrayBufferToBase64, getIcon, normalizePath, Platform, type App, } from "obsidian";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";
import type { FileChange } from "src/git/types";
import type { PublishBackend } from "src/publisher/PublishBackend";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import { PathMapper } from "src/git/PathMapper";
import { PublishFile } from "src/publishFile/PublishFile";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import {
	DataStore,
	type AssetShaCache,
	type CachedStatusMetadata,
} from "src/cache/DataStore";
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
import { isPathIgnored } from "src/utils/ignoredFolders";
import type { IOperabilityEventSink } from "src/operability/types";
import {
	AssetSyncer,
	type AssetSyncResult,
} from "src/compiler/integrations/AssetSyncer";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";

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
		private quartzFileSource?: QuartzFileSource,
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
			if (isPathIgnored(path, settings.ignoredFolders)) continue;

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
		// CSS discovered dynamically while compiling notes (e.g. Dataview's
		// dv.view() view.css), not tied to any single integration.
		const discoveredStyles = new Set<string>();

		const publishedFiles: PublishFile[] = [];
		const failures: PublishFailure[] = [];
		const stagedAssetPaths = new Set<string>();
		const assetShas = new Map<string, AssetShaCache>();
		const loadedAssetPaths = new Set<string>();
		const updatedAssetShas = new Map<string, AssetShaCache>();

		try {
			// This optimization must not fetch on a cold cache or block publishing
			// when the cached tree is unavailable.
			const remoteIndex = await this.backend
				.getCachedTree(settings.gitBranch, true)
				.then((tree) => buildRemoteIndex(tree ?? [], this.pathMapper))
				.catch(() => buildRemoteIndex([], this.pathMapper));

			for (let index = 0; index < files.length; index += 1) {
				const file = files[index];
				if (!file) continue;

				// Staged per file so a failure midway cannot leave a partially
				// written note (text without its media) in the commit.
				const fileChanges: FileChange[] = [];
				const fileAssetPaths = new Set<string>();

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
					const uncachedPaths = [
						...new Set(
							assets.blobs.map((asset) => asset.vaultPath),
						),
					].filter((path) => !loadedAssetPaths.has(path));
					if (settings.useCache && uncachedPaths.length > 0) {
						try {
							const cached =
								await this.dataStore.loadAssetShas(
									uncachedPaths,
								);
							for (const [path, entry] of cached)
								assetShas.set(path, entry);
						} catch (error) {
							// Cache availability must never prevent a fresh read and stage.
							console.debug(
								"Asset SHA cache read failed:",
								error,
							);
						}
						for (const path of uncachedPaths)
							loadedAssetPaths.add(path);
					}
					const repoPath = this.pathMapper.toRepoPath(
						file.getVaultPath(),
					);

					fileChanges.push({
						path: repoPath,
						content: text,
						encoding: "utf-8",
					});

					for (const style of assets.styles ?? []) {
						discoveredStyles.add(style);
					}

					for (const asset of assets.blobs) {
						const assetPath = this.pathMapper.toRepoPath(
							this.toVaultRelativePath(asset.path),
						);

						if (
							stagedAssetPaths.has(assetPath) ||
							fileAssetPaths.has(assetPath)
						) {
							continue;
						}

						const source = this.app.vault.getFileByPath(
							asset.vaultPath,
						);
						if (!source) {
							throw new Error(
								`Asset source is missing: ${asset.vaultPath} (destination: ${asset.path})`,
							);
						}
						const mtime = source.stat.mtime;
						const cached = assetShas.get(asset.vaultPath);
						let gitSha =
							cached?.mtime === mtime ? cached.gitSha : undefined;
						let bytes: ArrayBuffer | undefined;
						if (!gitSha) {
							bytes = await this.app.vault.readBinary(source);
							try {
								// Git hashes raw bytes, not the base64 transport text.
								gitSha = await generateBlobHash(
									new Uint8Array(bytes),
								);
							} catch {
								// If hashing fails, stage the bytes without a comparison.
							}
							if (source.stat.mtime !== mtime) {
								throw new Error(
									`Asset changed while reading: ${asset.vaultPath}. Retry publishing.`,
								);
							}
							if (gitSha) {
								const entry = { mtime, gitSha };
								assetShas.set(asset.vaultPath, entry);
								updatedAssetShas.set(asset.vaultPath, entry);
							}
						}

						const remote = remoteIndex.full.get(assetPath);
						if (gitSha && gitSha === remote?.sha) continue;

						bytes ??= await this.app.vault.readBinary(source);
						if (source.stat.mtime !== mtime) {
							throw new Error(
								`Asset changed while reading: ${asset.vaultPath}. Retry publishing.`,
							);
						}
						fileChanges.push({
							path: assetPath,
							content: arrayBufferToBase64(bytes),
							encoding: "base64",
						});
						fileAssetPaths.add(assetPath);
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
					for (const path of fileAssetPaths) {
						stagedAssetPaths.add(path);
					}
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

			const stagedAssets: Array<{
				path: string;
				content: string;
				encoding: "utf-8" | "base64";
			}> = [];
			const staleStyleFiles: string[] = [];
			if (settings.useCache && updatedAssetShas.size > 0) {
				try {
					await this.dataStore.storeAssetShas(updatedAssetShas);
				} catch (error) {
					console.debug("Asset SHA cache write failed:", error);
				}
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

			if (this.quartzFileSource) {
				const assetSyncer = new AssetSyncer(settings);
				const { textFiles, binaryAssets } = await this.resolveCssSnippets();
				const assetResult = await assetSyncer.collectAssets(
					this.quartzFileSource,
					textFiles,
					binaryAssets,
					Array.from(discoveredStyles),
				);

				for (const [path, content] of assetResult.filesToStage) {
					stagedAssets.push({ path, content, encoding: "utf-8" });
				}

				for (const [path, data] of assetResult.binaryFilesToStage) {
					stagedAssets.push({
						path,
						content: arrayBufferToBase64(data),
						encoding: "base64",
					});
				}

				staleStyleFiles.push(...assetResult.filesToDelete);
			}

			const repoAssets = await this.collectIntegrationAssets(settings);
			if (repoAssets) {
				for (const [path, content] of repoAssets.filesToStage) {
					stagedAssets.push({ path, content, encoding: "utf-8" });
				}

				for (const [path, data] of repoAssets.binaryFilesToStage) {
					stagedAssets.push({
						path,
						content: arrayBufferToBase64(data),
						encoding: "base64",
					});
				}

				staleStyleFiles.push(...repoAssets.filesToDelete);
			}

			changes.push(...stagedAssets);

			const result = await this.backend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

			if (staleStyleFiles.length > 0) {
				await this.backend.deleteFiles(
					settings.gitBranch,
					"Remove Quartz Syncer integration styles",
					[...new Set(staleStyleFiles)],
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

	/**
	 * Reads the user-selected CSS snippets from the vault's config directory,
	 * plus any local files they reference via url() (e.g. fonts). These live
	 * outside the indexed vault (Vault API can't see them), so the raw
	 * adapter is used instead of app.vault.
	 */
	private async resolveCssSnippets(): Promise<{
		textFiles: Map<string, string>;
		binaryAssets: Map<string, ArrayBuffer>;
	}> {
		const textFiles = new Map<string, string>();
		const binaryAssets = new Map<string, ArrayBuffer>();
		const settings = this.plugin.settings;

		if (!settings.useCssSnippets) {
			return { textFiles, binaryAssets };
		}

		const wantedNames = new Set(
			settings.copyCssSnippets.filter((name) => name.length > 0),
		);

		if (wantedNames.size === 0) {
			return { textFiles, binaryAssets };
		}

		const snippetsDir = normalizePath(
			`${this.app.vault.configDir}/snippets`,
		);

		try {
			const { files } = await this.app.vault.adapter.list(snippetsDir);

			for (const filePath of files) {
				const fileName = filePath.split("/").pop();
				if (!fileName || !wantedNames.has(fileName)) continue;

				const content = await this.app.vault.adapter.read(filePath);
				textFiles.set(fileName, this.rewriteLucideCalloutIcons(content));

				for (const relativePath of this.resolveCssUrlPaths(content)) {
					if (binaryAssets.has(relativePath)) continue;

					const assetPath = normalizePath(
						`${snippetsDir}/${relativePath}`,
					);

					try {
						const exists =
							await this.app.vault.adapter.exists(assetPath);
						if (!exists) continue;

						const data =
							await this.app.vault.adapter.readBinary(assetPath);
						binaryAssets.set(relativePath, data);
					} catch (error) {
						console.debug(
							`Failed to read snippet asset ${relativePath}:`,
							error,
						);
					}
				}
			}
		} catch (error) {
			console.debug("Failed to read CSS snippets:", error);
		}

		return { textFiles, binaryAssets };
	}

	/**
	 * Rewrites Obsidian's `--callout-icon` shorthand — a bare Lucide icon ID
	 * (e.g. `lucide-package-open`) or a quoted inline `<svg>` literal — into
	 * the `url("data:image/svg+xml...")` form Quartz's `mask-image` expects.
	 * Declarations already using `url(...)` are left untouched.
	 */
	private rewriteLucideCalloutIcons(cssContent: string): string {
		const pattern =
			/(--callout-icon\s*:\s*)(?:(['"])(<svg[\s\S]*?<\/svg>)\2|([A-Za-z][\w-]*))(\s*;)/g;

		return cssContent.replace(
			pattern,
			(
				fullMatch,
				prefix: string,
				_quote: string | undefined,
				svgLiteral: string | undefined,
				iconName: string | undefined,
				suffix: string,
			) => {
				const svg = svgLiteral ?? getIcon(iconName!)?.outerHTML;
				if (!svg) return fullMatch;

				const encoded = this.encodeSvgForDataUri(svg);

				return `${prefix}url("data:image/svg+xml;utf8,${encoded}")${suffix}`;
			},
		);
	}

	/**
	 * Minimal SVG-in-CSS escaping (per Quartz docs): swap double quotes for
	 * single so they don't collide with the surrounding url("...") quotes,
	 * and percent-encode characters that would otherwise break the URI.
	 */
	private encodeSvgForDataUri(svg: string): string {
		return svg
			.replace(/"/g, "'")
			.replace(/%/g, "%25")
			.replace(/#/g, "%23")
			.replace(/\r?\n/g, "")
			.trim();
	}

	/**
	 * Extracts relative url(...) references from CSS (e.g. @font-face src),
	 * skipping absolute URLs, protocol-relative URLs, and data URIs.
	 */
	private resolveCssUrlPaths(cssContent: string): string[] {
		const paths = new Set<string>();
		const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
		let match: RegExpExecArray | null;

		while ((match = urlPattern.exec(cssContent)) !== null) {
			const rawPath = match[2]?.trim();
			if (!rawPath) continue;
			if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(rawPath)) continue;
			if (rawPath.startsWith("/")) continue;

			paths.add(rawPath.split("?")[0]!.split("#")[0]!);
		}

		return [...paths];
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
