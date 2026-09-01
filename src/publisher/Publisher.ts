import { Platform, type App } from "obsidian";
import { arrayBufferToBase64, getIcon, normalizePath } from "obsidian";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";
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
import {
	buildRemoteIndex,
	classifyArbitrary,
	classifyRemoteOnly,
} from "src/publisher/PublishStatusManager";
import { resolveLinkedMedia } from "src/publisher/MediaLinkResolver";
import type { CompilationQueue } from "src/services/CompilationQueue";
import { batchParallel, generateBlobHash } from "src/utils/utils";
import { isMediaFile } from "src/utils/mediaTypes";
import { isPathIgnored } from "src/utils/ignoredFolders";
import type { IOperabilityEventSink } from "src/operability/types";
import { AssetSyncer } from "src/compiler/integrations/AssetSyncer";
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

	private async compileAndHashSingle(file: PublishFile): Promise<string> {
		const compiled = await file.compile(
			this.compilationQueue !== undefined,
		);
		const hash = await generateBlobHash(compiled.getCompiledFile()[0]);
		return hash;
	}

	private async resolveMediaLinksIncremental(
		files: PublishFile[],
	): Promise<Map<string, string[]>> {
		const mediaLinks = new Map<string, string[]>();
		const concurrency = Platform.isMobileApp ? 2 : 5;

		await batchParallel(
			files,
			async (file) => {
				const links = await this.dataStore.loadMediaLinks(
					file.file.path,
				);
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

			for (const file of candidates) {
				const vaultPath = file.getVaultPath();
				const repoPath = this.pathMapper.toRepoPath(vaultPath);
				const remote = remoteIndex.content.get(repoPath);

				if (!remote) {
					unpublished.push(file);
					continue;
				}

				const localHash = settings.useCache
					? await this.dataStore.loadLocalHash(
							file.file.path,
							file.file.stat.mtime,
						)
					: await this.compileAndHashSingle(file);

				if (localHash && localHash === remote.sha) {
					published.push(file);
				} else {
					changed.push(file);
				}
			}

			const linkedMedia = await resolveLinkedMedia(candidates);
			const { deleted, media } = classifyRemoteOnly(
				remoteIndex,
				candidates,
				this.pathMapper,
				linkedMedia,
			);

			const mediaLinks =
				await this.resolveMediaLinksIncremental(candidates);

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

		try {
			for (let index = 0; index < files.length; index += 1) {
				const file = files[index];
				if (!file) continue;

				let storedFile = await this.dataStore.loadLocalFile(
					file.file.path,
					file.file.stat.mtime,
					true,
				);

				if (!storedFile) {
					const compiled = await file.compile(true);
					storedFile = compiled.getCompiledFile();
				}

				const [text, assets] = storedFile;
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

				for (const style of assets.styles ?? []) {
					discoveredStyles.add(style);
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
					changes.push({ path, content, encoding: "utf-8" });
				}

				for (const [path, data] of assetResult.binaryFilesToStage) {
					changes.push({
						path,
						content: arrayBufferToBase64(data),
						encoding: "base64",
					});
				}

				if (assetResult.filesToDelete.length > 0) {
					await this.backend.deleteFiles(
						settings.gitBranch,
						"Clean up syncer styles",
						assetResult.filesToDelete,
					);
				}
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
				this.eventSink?.emit("tree.refresh.failed", {
					error:
						error instanceof Error ? error.message : String(error),
				});
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
