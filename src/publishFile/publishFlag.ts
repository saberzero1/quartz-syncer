import { Notice, TFile, type App } from "obsidian";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

export type PublishFlagAction = "publish" | "unpublish" | "toggle" | "remove";

const ACTION_NOTICE: Record<PublishFlagAction, string> = {
	publish: "marked as publishable",
	unpublish: "marked as not publishable",
	toggle: "publication flag toggled",
	remove: "publication flag removed",
};

/**
 * Writes the publish property on a single note.
 *
 * The command palette and the `quartz-syncer:mark` CLI handler both route here
 * so the two surfaces cannot drift.
 */
export async function applyPublishFlag(
	app: App,
	file: TFile,
	key: string,
	action: PublishFlagAction,
): Promise<void> {
	const engine = new ObsidianFrontMatterEngine(
		app.vault,
		app.metadataCache,
		file,
		app.fileManager,
	);

	if (action === "remove") {
		engine.remove(key);
	} else if (action === "toggle") {
		engine.set(key, !engine.get(key));
	} else {
		engine.set(key, action === "publish");
	}

	await engine.apply();
}

/**
 * Applies the publish property to the active Markdown note, reporting the
 * outcome as a notice. Backs the command-palette entries.
 */
export async function applyPublishFlagToActiveFile(
	app: App,
	key: string,
	action: PublishFlagAction,
): Promise<void> {
	const file = app.workspace.getActiveFile();

	if (!file || !(file instanceof TFile) || file.extension !== "md") {
		new Notice("Quartz Syncer: open a markdown note first.");

		return;
	}

	try {
		await applyPublishFlag(app, file, key, action);
		new Notice(`Quartz Syncer: ${file.basename} ${ACTION_NOTICE[action]}.`);
	} catch (error) {
		new Notice(
			`Quartz Syncer: could not update ${file.basename}. ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
