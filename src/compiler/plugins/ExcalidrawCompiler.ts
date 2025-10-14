import { App, Notice } from "obsidian";
import { TCompilerStep } from "../SyncerPageCompiler";
import Logger from "js-logger";

// Source: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/%40types/ExcalidrawAutomate.d.ts
export declare class ExcalidrawAutomate {
	/**
	 *
	 * @param templatePath
	 * @param embedFont
	 * @param exportSettings use ExcalidrawAutomate.getExportSettings(boolean,boolean)
	 * @param loader use ExcalidrawAutomate.getEmbeddedFilesLoader(boolean?)
	 * @param theme
	 * @param padding
	 * @returns
	 */
	createSVG(
		templatePath?: string,
		embedFont?: boolean,
		exportSettings?: ExportSettings,
		loader?: any,
		theme?: string,
		padding?: number
	): Promise<SVGSVGElement>;

	/**
	 * utility function to generate EmbeddedFilesLoader object
	 * @param isDark
	 * @returns
	 */
	getEmbeddedFilesLoader(isDark?: boolean): any;

	/**
	 * utility function to generate ExportSettings object
	 * @param withBackground
	 * @param withTheme
	 * @returns
	 */
	getExportSettings(withBackground: boolean, withTheme: boolean): ExportSettings;
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
        console.log("Text:", text, " | ", file);
		const embeddedExcalidrawRegex = /!\[\[(.+?\.excalidraw\.md[^\]]*)\]\]/g;

		const embeds = text.matchAll(embeddedExcalidrawRegex);

		for (const embed of embeds) {
			const match = embed[0];
			const filePath = embed[1];

			console.log("Text:", match);
			console.log("File path:", filePath);

			const svg = await convertToHTMLSVG(filePath, this.app);
			console.log("svg:", svg);
			
			if (!svg)
				continue;

			text = text.replace(match, svg);
		}

		console.log("new text:", text);

		return text;
    }
}

// This is based from: https://github.com/Enveloppe/obsidian-enveloppe/blob/master/src/conversion/compiler/excalidraw.ts
export async function convertToHTMLSVG(path: string, app: App) {
	try {
		const excalidraw = app.plugins.getPlugin("obsidian-excalidraw-plugin");

		if (!excalidraw) 
			return null;

		const ea = excalidraw.ea as ExcalidrawAutomate;
		const settings = ea.getExportSettings(false, true);
		const embeddedFilesLoader = ea.getEmbeddedFilesLoader(true);
		const svg = await ea.createSVG(path, true, settings, embeddedFilesLoader);
		console.log("svg:\n",svg)

		return svg.outerHTML as string;
	} catch (e) {
		Logger.error(e);

		new Notice(
			"Quartz Syncer: Unable to render Excalidraw embedded image.",
		);
		
		return null;
	}
}
