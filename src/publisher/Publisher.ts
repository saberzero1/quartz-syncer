import type { App, TFile } from "obsidian";
import type QuartzSyncer from "src/main";
import type { GitBackend, FileChange } from "src/git/types";
import { PathMapper } from "src/git/PathMapper";
import { PublishFile } from "src/publishFile/PublishFile";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore } from "src/cache/DataStore";
import type { PublishResult, PublishStatus } from "src/publisher/types";
import { categorizeFiles } from "src/publisher/PublishStatusManager";

export class Publisher {
	private pathMapper: PathMapper;

	constructor(
		private app: App,
		private plugin: QuartzSyncer,
		private gitBackend: GitBackend,
		private compiler: SyncerPageCompiler,
		private dataStore: DataStore,
	) {
		this.pathMapper = new PathMapper(plugin.settings.contentFolder);
	}

	async getPublishStatus(): Promise<PublishStatus> {
		const settings = this.plugin.settings;
		const vault = this.app.vault as typeof this.app.vault & {
			getFiles?: () => TFile[];
		};
		const vaultFiles = vault.getFiles?.() ?? vault.getMarkdownFiles();
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

		if (settings.useCache) {
			await this.dataStore.preloadCache();
		}

		try {
			const compiledFiles: PublishFile[] = [];

			for (const file of publishFiles) {
				const compiled = await file.compile();
				compiledFiles.push(compiled);
			}

			const remoteTree = await this.gitBackend.readTree(
				settings.gitBranch,
			);

			return await categorizeFiles(
				compiledFiles,
				remoteTree,
				this.dataStore,
				this.pathMapper,
			);
		} finally {
			if (settings.useCache) {
				await this.dataStore.flushCache();
				this.dataStore.clearMemoryCache();
			}
		}
	}

	async publishBatch(
		files: PublishFile[],
		message?: string,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const changes: FileChange[] = [];
		const now = Date.now();
		const commitMessage = message ?? "Publish notes";

		try {
			for (const file of files) {
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
			}

			const result = await this.gitBackend.writeFiles(
				settings.gitBranch,
				commitMessage,
				changes,
			);

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

	async deleteBatch(
		paths: string[],
		message?: string,
	): Promise<PublishResult> {
		const settings = this.plugin.settings;
		const repoPaths = paths.map((path) =>
			this.pathMapper.toRepoPath(this.toVaultRelativePath(path)),
		);
		const commitMessage = message ?? "Delete notes";

		try {
			const result = await this.gitBackend.deleteFiles(
				settings.gitBranch,
				commitMessage,
				repoPaths,
			);

			for (const path of paths) {
				await this.dataStore.dropFile(path);
			}

			return {
				success: true,
				commitSha: result.sha,
				filesPublished: 0,
				filesDeleted: paths.length,
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

	private toVaultRelativePath(path: string): string {
		const vaultPath = this.plugin.settings.vaultPath;
		if (vaultPath !== "/" && path.startsWith(vaultPath)) {
			return path.replace(vaultPath, "");
		}
		return path;
	}
}
