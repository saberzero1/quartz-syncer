import { TFile, type App } from "obsidian";
import { isExcludedVaultPath } from "./ExcludedFolders";
import type QuartzSyncer from "src/main";
import QuartzSyncerSettings from "src/models/settings";
import { getSpecialFileType } from "src/publishFile/PublishFile";
import { hasPublishFlag } from "src/publishFile/Validator";
import { isWithinVaultPath } from "src/utils/utils";

function isEnabledSpecialFile(
	file: TFile,
	settings: QuartzSyncerSettings,
): boolean {
	const type = getSpecialFileType(file);

	if (type === "base") return settings.useBases;

	if (type === "canvas") return settings.useCanvas;

	if (type === "excalidraw") return settings.useExcalidraw;

	return false;
}

function collectFromMetadataCache(
	app: App,
	settings: QuartzSyncerSettings,
): Set<string> {
	const paths = new Set<string>();
	const vaultPath = settings.vaultPath ?? "/";

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isWithinVaultPath(file.path, vaultPath)) continue;

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

		if (hasPublishFlag(settings.publishFrontmatterKey, frontmatter)) {
			paths.add(file.path);
		}
	}

	return paths;
}

/**
 * Resolve the paths within the configured vault subfolder worth considering
 * for publishing.
 *
 * When all notes are publishable by default, includes regular markdown files,
 * not binary attachments. Otherwise, prefers the extended metadata cache's
 * inverse frontmatter index for explicitly marked files, falling back to
 * Obsidian's own metadata cache when that index is not ready.
 *
 * Both modes also include enabled special files. The full-vault walk needed
 * to find `.base`/`.canvas`/`.excalidraw` files runs only when at least one of
 * those types is enabled. In all-notes mode, `.excalidraw.md` files are special
 * files, not regular markdown, so they require `useExcalidraw`.
 *
 * @param app - The Obsidian app instance.
 * @param plugin - The plugin instance, used to reach the extended metadata cache.
 * @param settings - The current plugin settings.
 * @returns The set of candidate vault paths.
 */
export function collectCandidatePaths(
	app: App,
	plugin: QuartzSyncer,
	settings: QuartzSyncerSettings,
): Set<string> {
	let paths: Set<string>;
	const vaultPath = settings.vaultPath ?? "/";

	if (settings.allNotesPublishableByDefault) {
		paths = new Set(
			app.vault
				.getMarkdownFiles()
				.filter(
					(file) =>
						isWithinVaultPath(file.path, vaultPath) &&
						getSpecialFileType(file) === null,
				)
				.map((file) => file.path),
		);
	} else {
		const extCache = plugin.cacheHandle?.api;

		paths = extCache?.isReady
			? new Set(
					Array.from(
						extCache.getFilesWithFrontmatterValue(
							settings.publishFrontmatterKey,
							true,
						),
					).filter((path) => isWithinVaultPath(path, vaultPath)),
				)
			: collectFromMetadataCache(app, settings);
	}

	const specialTypesEnabled =
		settings.useBases || settings.useCanvas || settings.useExcalidraw;

	if (specialTypesEnabled) {
		for (const file of app.vault.getFiles()) {
			if (
				isWithinVaultPath(file.path, vaultPath) &&
				isEnabledSpecialFile(file, settings)
			) {
				paths.add(file.path);
			}
		}
	}

	return new Set(
		[...paths].filter((path) => !isExcludedVaultPath(path, settings)),
	);
}
