import { App, getLinkpath, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { isPluginEnabled, svgToData } from "src/utils/utils";
import { EXCALIDRAW_PLUGIN_ID } from "src/ui/suggest/constants";
import Logger from "js-logger";

export class ExcalidrawCompiler {
	app: App;
	excalidrawApi: ExcalidrawApi | undefined;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.excalidrawApi = getExcalidrawApi();
		this.serializer = new XMLSerializer();
	}

	compile: TCompilerStep = (file) => async (text) => {
		if (!this.excalidrawApi) return text;

		const excalidrawApi = this.excalidrawApi;

		// If it's a excalidraw file, draw convert to svg, convert to text then output it.
		if (file.getFrontmatter()["excalidraw-plugin"] === "parsed") {
			const { dark, light } = await convertToHTMLSVG(
				file.file.path,
				excalidrawApi,
			);

			if (!dark && !light) {
				return text;
			}

			// Not sure why sometimes the markdown processor in Quartz (Remark?) will mess up with the svg (depends on the svg)
			// It'll also break when the "HardLineBreaks" plugin is used on Quartz. Docs: https://quartz.jzhao.xyz/plugins/HardLineBreaks
			// Wrap it with a div to prevent it
			// const div = createDiv();
			// div.style.display = "inline-block";
			// div.appendChild(dark);
			// div.appendChild(light);

			text = `<div>
<div style="background-image:url(${svgToData(dark)});"></div>
<div style="background-image:url(${svgToData(light)});"></div>
</div>`;

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
			// not sure if there's a way to link to the section of the drawing.
			// Need excalidraw API to get position of embed and somehow highlight the frame in the full excalidraw drawing? Not sure if possible with svg..
			const linkEl = createEl("a", {
				text: displayName && !isEmbedded ? displayName : "",
				href: extensionlessPath,
				// cls: "internal"
			});

			if (isEmbedded) {
				const { dark, light } = await convertToHTMLSVG(
					filePath,
					excalidrawApi,
				);

				// If can't convert to svg, skip it
				if (!dark && !light) {
					// TODO? Not sure if need to delete linkEl? Not sure how js/obsidian handles memory
					continue;
				}

				// Get image size. Obsidian docs: https://help.obsidian.md/Linking+notes+and+files/Embed+files#Embed+an+image+in+a+note
				/*
				const getImgSizeRegex = /\d+(?:x(\d+))?/;

				const matches = displayName
					? displayName.match(getImgSizeRegex)
					: null;
					*/

				const width = `${dark.viewBox.baseVal.width}px`;
				const height = "auto";

				const aspectRatio =
					(dark.viewBox.baseVal.width * 1.0) /
					(dark.viewBox.baseVal.height * 1.0);

				/*
				while (dark.attributes.length > 0)
					dark.removeAttribute(dark.attributes[0].name);
				while (light.attributes.length > 0)
					light.removeAttribute(light.attributes[0].name);
					*/
				dark.removeAttribute("width");
				dark.removeAttribute("height");
				dark.removeAttribute("viewBox");
				light.removeAttribute("width");
				light.removeAttribute("height");
				light.removeAttribute("viewBox");

				/*
				if (matches) {
					width = matches[0];

					if (matches[1]) {
						height = matches[1];
					}
				}
				*/

				// Not sure why sometimes the markdown processor in Quartz (Remark?) will mess up with the svg (depends on the svg)
				// It'll also break when the "HardLineBreaks" plugin is used on Quartz. Docs: https://quartz.jzhao.xyz/plugins/HardLineBreaks
				// Wrap it with a div to prevent it
				// const div = createDiv();

				// TODO: Add option in settings? Not sure if should though, later clutter settings page...
				linkEl.dataset.noPopover = "true";

				// <div> contains <a> which contains <svg>
				const resultString = `<div>
<div class="excalidraw-svg excalidraw-dark" style="background-image:url(${svgToData(dark)});background-size:cover;background-repeat:no-repeat;width:${width};height:${height};aspect-ratio:${aspectRatio};"></div>
<div class="excalidraw-svg excalidraw-light" style="background-image:url(${svgToData(light)});background-size:cover;background-repeat:no-repeat;width:${width};height:${height};aspect-ratio:${aspectRatio};"></div>
<style type="text/css">.excalidraw-svg {display:none;max-width:100%;margin:0 auto;} :root[saved-theme=dark] .excalidraw-dark {display:block;} :root[saved-theme=light] .excalidraw-light {display:block;}</style>
</div>`;
				//div.appendChild(linkEl);

				text = text.replace(match, resultString);
			} else {
				text = text.replace(match, linkEl.outerHTML);
			}
		}

		return text;

		// This is based of: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/excalidraw.ts
		async function convertToHTMLSVG(path: string, ea: ExcalidrawApi) {
			try {
				// TODO: Add integration with themes (dark/light).
				//Maybe add add an option in settings on
				// - if export with background and
				// - if export with the excalidraw note theme  (or if should override to light/dark)
				const settings = ea.getExportSettings(false, true);
				const embeddedFilesLoaderDark = ea.getEmbeddedFilesLoader(true);

				const embeddedFilesLoaderLight =
					ea.getEmbeddedFilesLoader(false);

				// TODO: Option in settings here too?
				const svgDark = await ea.createSVG(
					path,
					false,
					settings,
					embeddedFilesLoaderDark,
					"dark",
				);

				const svgLight = await ea.createSVG(
					path,
					false,
					settings,
					embeddedFilesLoaderLight,
					"light",
				);

				svgDark.style.maxWidth = "100%";
				svgDark.style.height = "auto";

				svgDark.style.display = "var(--lightningcss-light, none)";

				svgDark
					.querySelectorAll("style.style-fonts, metadata, mask, defs")
					?.forEach((element) => {
						element.remove();
					});

				svgLight.style.maxWidth = "100%";
				svgLight.style.height = "auto";

				svgLight.style.display = "var(--lightningcss-dark, none)";

				svgLight
					.querySelectorAll("style.style-fonts, metadata, mask, defs")
					?.forEach((element) => {
						element.remove();
					});

				return {
					dark: svgDark,
					light: svgLight,
				};
			} catch (e) {
				Logger.error(e);

				new Notice(
					"Quartz Syncer: Unable to render Excalidraw embedded image.",
				);

				return { dark: null, light: null };
			}
		}
	};
}

function getExcalidrawApi(): ExcalidrawApi | undefined {
	if (isPluginEnabled(EXCALIDRAW_PLUGIN_ID)) {
		//@ts-expect-error If Excalidraw is enabled, it should be available on the window object
		return app.plugins.getPlugin(EXCALIDRAW_PLUGIN_ID).ea as ExcalidrawApi;
	}

	return undefined;
}

declare class ExcalidrawApi {
	excalidrawApi: ExcalidrawApi;
	constructor(excalidrawApi: ExcalidrawApi);

	// Source for ExcalidrawAutomate and ExportSettings:
	// copied from: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/%40types/ExcalidrawAutomate.d.ts
	/**
	 *
	 * @param templatePath -
	 * @param embedFont -
	 * @param exportSettings - use ExcalidrawAutomate.getExportSettings(boolean,boolean)
	 * @param loader - use ExcalidrawAutomate.getEmbeddedFilesLoader(boolean?)
	 * @param forceTheme - "dark" | "light" | undefined
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
	 * @param isDark -
	 * @returns
	 */
	getEmbeddedFilesLoader(isDark?: boolean): unknown;

	/**
	 * utility function to generate ExportSettings object
	 * @param withBackground -
	 * @param withTheme -
	 * @returns
	 */
	getExportSettings(
		withBackground: boolean,
		withTheme: boolean,
		isMask?: boolean,
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
