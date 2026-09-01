import { Notice } from "obsidian";
import { integrationRegistry } from "./registry";
import QuartzSyncerSettings from "src/models/settings";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";

const SYNCER_STYLES_DIR = "quartz/styles/syncer";
const INDEX_FILE = "_index.scss";
const CUSTOM_SCSS_PATH = "quartz/styles/custom.scss";
const SYNCER_IMPORT = '@use "./syncer";';

export interface AssetSyncResult {
	success: boolean;
	filesToStage: Map<string, string>;
	binaryFilesToStage: Map<string, ArrayBuffer>;
	filesToDelete: string[];
}

export class AssetSyncer {
	private settings: QuartzSyncerSettings;

	constructor(settings: QuartzSyncerSettings) {
		this.settings = settings;
	}

	async collectAssets(
		connection: QuartzFileSource,
		snippetFiles?: Map<string, string>,
		snippetAssets?: Map<string, ArrayBuffer>,
		discoveredStyles?: string[],
	): Promise<AssetSyncResult> {
		const result: AssetSyncResult = {
			success: false,
			filesToStage: new Map(),
			binaryFilesToStage: new Map(),
			filesToDelete: [],
		};

		try {
			if (!this.settings.manageSyncerStyles) {
				const cleanup = await this.collectCleanup(connection);
				result.filesToDelete = cleanup.filesToDelete;

				if (cleanup.customScssUpdate) {
					result.filesToStage.set(
						CUSTOM_SCSS_PATH,
						cleanup.customScssUpdate,
					);
				}

				if (
					result.filesToDelete.length > 0 ||
					result.filesToStage.size > 0
				) {
					console.debug(
						`Will remove ${result.filesToDelete.length} syncer style files`,
					);
				}

				result.success = true;

				return result;
			}

			const scssFiles = this.getScssFiles(snippetFiles, discoveredStyles);
			const binaryFiles = this.getBinaryAssetFiles(snippetAssets);
			const expectedFiles = new Set([
				...scssFiles.keys(),
				...binaryFiles.keys(),
			]);

			result.filesToDelete = await this.collectOrphanedStyleFiles(
				connection,
				expectedFiles,
			);

			if (scssFiles.size > 0 || binaryFiles.size > 0) {
				for (const [path, content] of scssFiles) {
					result.filesToStage.set(path, content);
				}

				result.binaryFilesToStage = binaryFiles;

				const customScssUpdate =
					await this.getCustomScssUpdate(connection);

				if (customScssUpdate) {
					result.filesToStage.set(CUSTOM_SCSS_PATH, customScssUpdate);
					console.debug("Will add syncer import to custom.scss");
				}

				console.debug(
					`Collected ${result.filesToStage.size} integration style files`,
				);
			}

			result.success = true;
		} catch (error) {
			console.debug("Failed to collect integration assets", error);

			new Notice(
				"Quartz Syncer: Failed to collect integration styles. Check console for details.",
				10000,
			);
			result.success = false;
		}

		return result;
	}

	/**
	 * Finds files already staged in the syncer directory that are no longer
	 * produced this run (e.g. a deselected snippet, a disabled integration,
	 * or a stale file left behind by a previous filename/extension scheme).
	 */
	private async collectOrphanedStyleFiles(
		connection: QuartzFileSource,
		expectedFiles: Set<string>,
	): Promise<string[]> {
		const orphaned: string[] = [];

		try {
			const existing = await connection.listAllFiles(SYNCER_STYLES_DIR);

			for (const filepath of existing) {
				if (!expectedFiles.has(filepath)) {
					orphaned.push(filepath);
				}
			}
		} catch (error) {
			console.debug(
				"Could not list syncer style files for orphan cleanup",
				error,
			);
		}

		return orphaned;
	}

	private async collectCleanup(connection: QuartzFileSource): Promise<{
		filesToDelete: string[];
		customScssUpdate: string | null;
	}> {
		const filesToDelete: string[] = [];
		let customScssUpdate: string | null = null;

		try {
			const entries = await connection.listAllFiles(SYNCER_STYLES_DIR);
			filesToDelete.push(...entries);
		} catch (error) {
			console.debug(
				"Could not list syncer style files for cleanup",
				error,
			);
		}

		try {
			const content = await connection.readFile(CUSTOM_SCSS_PATH);

			if (content && content.includes(SYNCER_IMPORT)) {
				customScssUpdate = this.removeSyncerImport(content);
			}
		} catch {
			console.debug("custom.scss not found, no cleanup needed");
		}

		return { filesToDelete, customScssUpdate };
	}

	private async getCustomScssUpdate(
		connection: QuartzFileSource,
	): Promise<string | null> {
		try {
			let content = "";

			try {
				const customScss = await connection.readFile(CUSTOM_SCSS_PATH);

				if (customScss) {
					content = customScss;
				}
			} catch {
				console.debug("custom.scss not found, will create with import");
			}

			if (!content.includes(SYNCER_IMPORT)) {
				return this.insertSyncerImport(content);
			}

			return null;
		} catch (error) {
			console.debug("Failed to check custom.scss", error);
			throw error;
		}
	}

	private insertSyncerImport(content: string): string {
		if (!content.trim()) {
			return `${SYNCER_IMPORT}\n`;
		}

		const firstLineImportPattern =
			/@use\s+["']\.\/(?:base|variables)(?:\.scss)?["'](?:\s+as\s+\*)?;?/;
		const match = content.match(firstLineImportPattern);

		if (match) {
			const insertPosition = match.index! + match[0].length;
			const before = content.slice(0, insertPosition);
			const after = content.slice(insertPosition);

			return `${before}\n${SYNCER_IMPORT}${after}`;
		}

		return `${SYNCER_IMPORT}\n\n${content}`;
	}

	private removeSyncerImport(content: string): string {
		const importPattern = new RegExp(
			`\\n?${SYNCER_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
			"g",
		);

		return content.replace(importPattern, "\n").replace(/^\n+/, "");
	}

	/**
	 * Builds the SCSS files to stage: known-integration styles plus any
	 * pre-resolved Obsidian CSS snippets (read from the vault by the caller,
	 * since this class only has access to the Quartz repo, not the vault),
	 * plus CSS discovered dynamically while compiling notes — content that
	 * isn't tied to a fixed integration stylesheet because it varies per
	 * note (e.g. Dataview's `dv.view()` folder-based `view.css`).
	 */
	getScssFiles(
		snippetFiles?: Map<string, string>,
		discoveredStyles?: string[],
	): Map<string, string> {
		const files = new Map<string, string>();
		const assets = integrationRegistry.getCollectedAssets(this.settings);
		const indexImports: string[] = [];

		for (const [integrationId, integrationAssets] of assets) {
			if (integrationAssets.scss) {
				const filename = `_${integrationId}.scss`;
				const filepath = `${SYNCER_STYLES_DIR}/${filename}`;
				files.set(filepath, integrationAssets.scss);
				indexImports.push(`@use "./${integrationId}";`);
			}
		}

		if (this.settings.useCssSnippets && snippetFiles) {
			for (const [fileName, content] of snippetFiles) {
				const baseName = fileName.replace(/\.css$/, "");
				const filepath = `${SYNCER_STYLES_DIR}/_${baseName}.scss`;
				files.set(filepath, content);
				indexImports.push(`@use "./${baseName}";`);
			}
		}

		if (discoveredStyles && discoveredStyles.length > 0) {
			const uniqueStyles = Array.from(new Set(discoveredStyles));
			const filepath = `${SYNCER_STYLES_DIR}/_discovered-styles.scss`;
			files.set(filepath, uniqueStyles.join("\n\n"));
			indexImports.push('@use "./discovered-styles";');
		}

		if (indexImports.length > 0) {
			const indexContent = `// Quartz Syncer Integration Styles
// This file is auto-generated. Do not edit manually.

${indexImports.join("\n")}
`;
			files.set(`${SYNCER_STYLES_DIR}/${INDEX_FILE}`, indexContent);
		}

		return files;
	}

	/**
	 * Maps resolved binary snippet assets (e.g. fonts referenced by url() in
	 * a snippet's CSS) to their staged repo paths, preserving the relative
	 * path they were referenced by so the copied CSS needs no rewriting.
	 */
	private getBinaryAssetFiles(
		snippetAssets?: Map<string, ArrayBuffer>,
	): Map<string, ArrayBuffer> {
		const files = new Map<string, ArrayBuffer>();

		if (this.settings.useCssSnippets && snippetAssets) {
			for (const [relativePath, data] of snippetAssets) {
				files.set(`${SYNCER_STYLES_DIR}/${relativePath}`, data);
			}
		}

		return files;
	}
}

export const SYNCER_IMPORT_INSTRUCTION = SYNCER_IMPORT;
