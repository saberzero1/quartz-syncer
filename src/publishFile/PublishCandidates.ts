import { TFile, type App } from "obsidian";
import type QuartzSyncer from "src/main";
import QuartzSyncerSettings from "src/models/settings";
import { getSpecialFileType } from "src/publishFile/PublishFile";
import { hasPublishFlag } from "src/publishFile/Validator";

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

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

		if (hasPublishFlag(settings.publishFrontmatterKey, frontmatter)) {
			paths.add(file.path);
		}
	}

	return paths;
}

/**
 * Resolve the vault paths worth considering for publishing.
 *
 * Prefers the extended metadata cache's inverse frontmatter index. When that
 * index is not ready, this falls back to Obsidian's own metadata cache rather
 * than promoting every vault file to a candidate, which on large vaults turned
 * a 331-note lookup into a 28,000-file scan.
 *
 * The full-vault walk needed to find `.base`/`.canvas`/`.excalidraw` files runs
 * only when at least one of those file types is enabled.
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
	if (settings.allNotesPublishableByDefault) {
		return new Set(app.vault.getFiles().map((file) => file.path));
	}

	const extCache = plugin.cacheHandle?.api;

	const paths = extCache?.isReady
		? new Set(
				extCache.getFilesWithFrontmatterValue(
					settings.publishFrontmatterKey,
					true,
				),
			)
		: collectFromMetadataCache(app, settings);

	const specialTypesEnabled =
		settings.useBases || settings.useCanvas || settings.useExcalidraw;

	if (specialTypesEnabled) {
		for (const file of app.vault.getFiles()) {
			if (isEnabledSpecialFile(file, settings)) {
				paths.add(file.path);
			}
		}
	}

	return paths;
}
