import { App, getLinkpath, Notice } from "obsidian";
import { TCompilerStep } from "../SyncerPageCompiler";
import Logger from "js-logger";

// TODO: Put this somewhere else?
// Also not really sure if this is correct, not very familiar with TypeScript's syntax and types
declare module "obsidian" {
	interface App {
		plugins: {
			getPlugin(id: "obsidian-excalidraw-plugin"): {
				ea: ExcalidrawAutomate;
			} | null;
		};
	}
}

// Source for ExcalidrawAutomate and ExportSettings:
// copied from: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/%40types/ExcalidrawAutomate.d.ts
export declare class ExcalidrawAutomate {
	/**
	 *
	 * @param templatePath -
	 * @param embedFont -
	 * @param exportSettings - use ExcalidrawAutomate.getExportSettings(boolean,boolean)
	 * @param loader - use ExcalidrawAutomate.getEmbeddedFilesLoader(boolean?)
	 * @param theme -
	 * @param padding -
	 * @returns
	 */
	createSVG(
		templatePath?: string,
		embedFont?: boolean,
		exportSettings?: ExportSettings,
		loader?: unknown,
		theme?: string,
		padding?: number,
	): Promise<SVGSVGElement>;

	/**
	 * utility function to generate EmbeddedFilesLoader object
	 * @param isDark
	 * @returns
	 */
	getEmbeddedFilesLoader(isDark?: boolean): unknown;

	/**
	 * utility function to generate ExportSettings object
	 * @param withBackground
	 * @param withTheme
	 * @returns
	 */
	getExportSettings(
		withBackground: boolean,
		withTheme: boolean,
	): ExportSettings;
}

interface ExportSettings {
	withBackground: boolean;
	withTheme: boolean;
	isMask: boolean;
	frameRendering?: {
		//optional, overrides relevant appState settings for rendering the frame
		enabled: boolean;
		name: boolean;
		outline: boolean;
		clip: boolean;
	};
	skipInliningFonts?: boolean;
}

export class ExcalidrawCompiler {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	compile: TCompilerStep = (file) => async (text) => {
		// If it's a excalidraw file, draw convert to svg, convert to text then output it.
		if (file.getFrontmatter()["excalidraw-plugin"] === "parsed") {
			const svg = await convertToHTMLSVG(file.file.path, this.app);

			if (!svg) {
				return text;
			}

			// Not sure why sometimes the markdown processor in Quartz (Remark?) will mess up with the svg (depends on the svg)
			// It'll also break when the "HardLineBreaks" plugin is used on Quartz. Docs: https://quartz.jzhao.xyz/plugins/HardLineBreaks
			// Wrap it with a div to prevent it
			const div = createDiv();
			div.style.display = "inline-block";
			div.appendChild(svg);

			text = elementToText(div);

			return text;
		}

		// TODO? Add check with the frontmatter too?
		// As afaik, excalidraw checks the frontmatter for excalidraw-plugin == "parsed" instead of the file name
		// But then need to check with every single embedded link...
		const linkedExcalidrawRegex =
			/!?\[\[(.+?\.excalidraw(?:\.md)?.*?)(?:\|(.+))?\]\]/g;

		const links = text.matchAll(linkedExcalidrawRegex);

		for (const link of links) {
			const match = link[0];
			const filePath = link[1];
			const displayName = link[2];
			const isEmbedded = match.charAt(0) === "!";

			// Copied overall logic for getting href link from: SyncerPageCompiler.convertLinksToFullPath
			const fullLinkedFilePath = getLinkpath(filePath);

			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				fullLinkedFilePath,
				file.getPath(),
			);

			// If can't find the file, skip it
			if (!linkedFile) {
				continue;
			}

			const extensionlessPath = linkedFile.path.substring(
				0,
				linkedFile.path.lastIndexOf("."),
			);

			// Wrap svg with a anchor tag linked to the excalidraw drawing
			// TODO? Some embeds isn't the full drawing (Like embedding a frame only),
			// 		 not sure if there's a way to link to the section of the drawing.
			// 		 Need excalidraw API to get position of embed and somehow highlight the frame in the full excalidraw drawing? Not sure if possible with svg..
			const linkEl = createEl("a", {
				text: displayName && !isEmbedded ? displayName : "",
				href: extensionlessPath,
				// cls: "internal"
			});

			if (isEmbedded) {
				const svg = await convertToHTMLSVG(filePath, this.app);

				// If can't convert to svg, skip it
				if (!svg) {
					// TODO? Not sure if need to delete linkEl? Not sure how js/obsidian handles memory
					continue;
				}

				// Get image size. Obsidian docs: https://help.obsidian.md/Linking+notes+and+files/Embed+files#Embed+an+image+in+a+note
				const getImgSizeRegex = /\d+(?:x(\d+))?/;

				const matches = displayName
					? displayName.match(getImgSizeRegex)
					: null;

				if (matches) {
					svg.style.width = matches[0];

					if (matches[1]) {
						svg.style.height = matches[1] ?? "auto";
					}
				}

				// Not sure why sometimes the markdown processor in Quartz (Remark?) will mess up with the svg (depends on the svg)
				// It'll also break when the "HardLineBreaks" plugin is used on Quartz. Docs: https://quartz.jzhao.xyz/plugins/HardLineBreaks
				// Wrap it with a div to prevent it
				const div = createDiv();
				div.style.display = "inline-block";

				// TODO: Add option in settings? Not sure if should though, later clutter settings page...
				linkEl.dataset.noPopover = "true";

				// <div> contains <a> which contains <svg>
				linkEl.appendChild(svg);
				div.appendChild(linkEl);

				text = text.replace(match, elementToText(div));
			} else {
				text = text.replace(match, elementToText(linkEl));
			}
		}

		return text;
	};
}

// This is based of: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/excalidraw.ts
async function convertToHTMLSVG(path: string, app: App) {
	try {
		const excalidraw = app.plugins.getPlugin("obsidian-excalidraw-plugin");

		if (!excalidraw) return null;

		const ea = excalidraw.ea as ExcalidrawAutomate;
		// TODO: Add integration with themes (dark/light).
		//		 Maybe add add an option in settings on
		// 		 - if export with background and
		// 		 - if export with the excalidraw note theme  (or if should override to light/dark)
		const settings = ea.getExportSettings(false, true);
		const embeddedFilesLoader = ea.getEmbeddedFilesLoader(false);

		// TODO: Option in settings here too?
		const svg = await ea.createSVG(
			path,
			true,
			settings,
			embeddedFilesLoader,
		);
		svg.style.maxWidth = "100%";
		svg.style.height = "auto";

		return svg;
	} catch (e) {
		Logger.error(e);

		new Notice(
			"Quartz Syncer: Unable to render Excalidraw embedded image.",
		);

		return null;
	}
}

function elementToText(el: Node) {
	return new XMLSerializer().serializeToString(el);
}
