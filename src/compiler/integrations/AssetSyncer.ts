import { Notice } from "obsidian";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { integrationRegistry } from "./registry";
import QuartzSyncerSettings from "src/models/settings";
import Logger from "js-logger";

const SYNCER_STYLES_DIR = "quartz/styles/syncer";
const INDEX_FILE = "_index.scss";
const CUSTOM_SCSS_PATH = "quartz/styles/custom.scss";
const SYNCER_IMPORT = '@use "./syncer";';

export interface AssetSyncResult {
	success: boolean;
	filesToStage: Map<string, string>;
	filesToDelete: string[];
}

export class AssetSyncer {
	private settings: QuartzSyncerSettings;

	constructor(settings: QuartzSyncerSettings) {
		this.settings = settings;
	}

	async collectAssets(
		connection: RepositoryConnection,
	): Promise<AssetSyncResult> {
		const result: AssetSyncResult = {
			success: false,
			filesToStage: new Map(),
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
					Logger.info(
						`Will remove ${result.filesToDelete.length} syncer style files`,
					);
				}

				result.success = true;

				return result;
			}

			const scssFiles = this.getScssFiles();

			if (scssFiles.size > 0) {
				for (const [path, content] of scssFiles) {
					result.filesToStage.set(path, content);
				}

				const customScssUpdate =
					await this.getCustomScssUpdate(connection);

				if (customScssUpdate) {
					result.filesToStage.set(CUSTOM_SCSS_PATH, customScssUpdate);
					Logger.info("Will add syncer import to custom.scss");
				}

				Logger.info(
					`Collected ${result.filesToStage.size} integration style files`,
				);
			}

			result.success = true;
		} catch (error) {
			Logger.error("Failed to collect integration assets", error);

			new Notice(
				"Quartz Syncer: Failed to collect integration styles. Check console for details.",
				10000,
			);
			result.success = false;
		}

		return result;
	}

	private async collectCleanup(connection: RepositoryConnection): Promise<{
		filesToDelete: string[];
		customScssUpdate: string | null;
	}> {
		const filesToDelete: string[] = [];
		let customScssUpdate: string | null = null;

		try {
			const repoContent = await connection.getContent();

			if (repoContent) {
				const syncerFiles = repoContent.tree.filter(
					(entry) =>
						entry.path.startsWith(SYNCER_STYLES_DIR) &&
						entry.type === "blob",
				);

				for (const file of syncerFiles) {
					filesToDelete.push(file.path);
				}
			}
		} catch (error) {
			Logger.debug(
				"Could not list syncer style files for cleanup",
				error,
			);
		}

		try {
			const customScss = await connection.getRawFile(CUSTOM_SCSS_PATH);

			if (customScss) {
				const content = Buffer.from(
					customScss.content,
					"base64",
				).toString("utf-8");

				if (content.includes(SYNCER_IMPORT)) {
					customScssUpdate = this.removeSyncerImport(content);
				}
			}
		} catch {
			Logger.debug("custom.scss not found, no cleanup needed");
		}

		return { filesToDelete, customScssUpdate };
	}

	private async getCustomScssUpdate(
		connection: RepositoryConnection,
	): Promise<string | null> {
		try {
			let content = "";

			try {
				const customScss =
					await connection.getRawFile(CUSTOM_SCSS_PATH);

				if (customScss) {
					content = Buffer.from(
						customScss.content,
						"base64",
					).toString("utf-8");
				}
			} catch {
				Logger.debug("custom.scss not found, will create with import");
			}

			if (!content.includes(SYNCER_IMPORT)) {
				return this.insertSyncerImport(content);
			}

			return null;
		} catch (error) {
			Logger.error("Failed to check custom.scss", error);
			throw error;
		}
	}

	private insertSyncerImport(content: string): string {
		if (!content.trim()) {
			return `${SYNCER_IMPORT}\n`;
		}

		const baseImportPattern = /@use\s+["']\.\/base(?:\.scss)?["'];?/;
		const match = content.match(baseImportPattern);

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

	getScssFiles(): Map<string, string> {
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

		if (indexImports.length > 0) {
			const indexContent = `// Quartz Syncer Integration Styles
// This file is auto-generated. Do not edit manually.

${indexImports.join("\n")}
`;
			files.set(`${SYNCER_STYLES_DIR}/${INDEX_FILE}`, indexContent);
		}

		return files;
	}
}

export const SYNCER_IMPORT_INSTRUCTION = SYNCER_IMPORT;
