import { getLinkpath, Notice } from "obsidian";
import Logger from "js-logger";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
	QuartzAssets,
} from "./types";
import { isPluginEnabled, svgToData } from "src/utils/utils";
import { EXCALIDRAW_PLUGIN_ID } from "src/ui/suggest/constants";
import { PublishFile } from "src/publishFile/PublishFile";

const excalidrawScss = `
.excalidraw-svg {
  display: none;
  max-width: 100%;
  margin: 0 auto;
}

:root[saved-theme="dark"] .excalidraw-dark {
  display: block;
}

:root[saved-theme="light"] .excalidraw-light {
  display: block;
}
`;

interface ExportSettings {
	withBackground: boolean;
	withTheme: boolean;
	isMask: boolean;
	frameRendering?: {
		enabled: boolean;
		name: boolean;
		outline: boolean;
		clip: boolean;
	};
	skipInliningFonts?: boolean;
}

interface ExcalidrawApi {
	createSVG(
		templatePath?: string,
		embedFont?: boolean,
		exportSettings?: ExportSettings,
		loader?: unknown,
		theme?: string,
		padding?: number,
	): Promise<SVGSVGElement>;
	getEmbeddedFilesLoader(isDark?: boolean): unknown;
	getExportSettings(
		withBackground: boolean,
		withTheme: boolean,
		isMask?: boolean,
	): ExportSettings;
}

function getExcalidrawApi(): ExcalidrawApi | undefined {
	if (isPluginEnabled(EXCALIDRAW_PLUGIN_ID)) {
		// @ts-expect-error Excalidraw exposes API via plugin when enabled
		return app.plugins.getPlugin(EXCALIDRAW_PLUGIN_ID).ea as ExcalidrawApi;
	}

	return undefined;
}

async function convertToHTMLSVG(
	path: string,
	ea: ExcalidrawApi,
): Promise<{ dark: SVGSVGElement | null; light: SVGSVGElement | null }> {
	try {
		const settings = ea.getExportSettings(false, true);
		const embeddedFilesLoaderDark = ea.getEmbeddedFilesLoader(true);
		const embeddedFilesLoaderLight = ea.getEmbeddedFilesLoader(false);

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
			?.forEach((element) => element.remove());

		svgLight.style.maxWidth = "100%";
		svgLight.style.height = "auto";
		svgLight.style.display = "var(--lightningcss-dark, none)";

		svgLight
			.querySelectorAll("style.style-fonts, metadata, mask, defs")
			?.forEach((element) => element.remove());

		return { dark: svgDark, light: svgLight };
	} catch (e) {
		Logger.error(e);

		new Notice(
			"Quartz Syncer: Unable to render Excalidraw embedded image.",
		);

		return { dark: null, light: null };
	}
}

export const ExcalidrawIntegration: PluginIntegration = {
	id: "excalidraw",
	name: "Excalidraw",
	settingKey: "useExcalidraw",
	priority: 50,

	assets: {
		scss: excalidrawScss,
	} as QuartzAssets,

	isAvailable(): boolean {
		return !!getExcalidrawApi();
	},

	getPatterns(): PatternDescriptor[] {
		return [
			{
				id: "excalidraw-embed",
				pattern: /!\[\[(.+?\.excalidraw(?:\.md)?.*?)(?:\|(.+))?\]\]/g,
				type: "inline",
			},
			{
				id: "excalidraw-link",
				pattern: /\[\[(.+?\.excalidraw(?:\.md)?.*?)(?:\|(.+))?\]\]/g,
				type: "inline",
			},
		];
	},

	shouldTransformFile(file: PublishFile): boolean {
		return file.getFrontmatter()?.["excalidraw-plugin"] === "parsed";
	},

	async transformFile(
		file: PublishFile,
		_text: string,
		_context: CompileContext,
	): Promise<string> {
		const excalidrawApi = getExcalidrawApi();

		if (!excalidrawApi) return _text;

		const { dark, light } = await convertToHTMLSVG(
			file.file.path,
			excalidrawApi,
		);

		if (!dark && !light) {
			return _text;
		}

		return `<div>
<div style="background-image:url(${svgToData(dark!)});"></div>
<div style="background-image:url(${svgToData(light!)});"></div>
</div>`;
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const excalidrawApi = getExcalidrawApi();

		if (!excalidrawApi) return match.fullMatch;

		const filePath = match.captures[0];
		const displayName = match.captures[1];
		const isEmbedded = match.descriptor.id === "excalidraw-embed";

		const fullLinkedFilePath = getLinkpath(filePath);

		const linkedFile = context.app.metadataCache.getFirstLinkpathDest(
			fullLinkedFilePath,
			context.file.getPath(),
		);

		if (!linkedFile) {
			return match.fullMatch;
		}

		const extensionlessPath = linkedFile.path.substring(
			0,
			linkedFile.path.lastIndexOf("."),
		);

		const linkEl = createEl("a", {
			text: displayName && !isEmbedded ? displayName : "",
			href: extensionlessPath,
		});

		if (isEmbedded) {
			const { dark, light } = await convertToHTMLSVG(
				filePath,
				excalidrawApi,
			);

			if (!dark && !light) {
				return match.fullMatch;
			}

			const width = `${dark!.viewBox.baseVal.width}px`;
			const height = "auto";

			const aspectRatio =
				(dark!.viewBox.baseVal.width * 1.0) /
				(dark!.viewBox.baseVal.height * 1.0);

			dark!.removeAttribute("width");
			dark!.removeAttribute("height");
			dark!.removeAttribute("viewBox");
			light!.removeAttribute("width");
			light!.removeAttribute("height");
			light!.removeAttribute("viewBox");

			linkEl.dataset.noPopover = "true";

			return `<div>
<div class="excalidraw-svg excalidraw-dark" style="background-image:url(${svgToData(dark!)});background-size:cover;background-repeat:no-repeat;width:${width};height:${height};aspect-ratio:${aspectRatio};"></div>
<div class="excalidraw-svg excalidraw-light" style="background-image:url(${svgToData(light!)});background-size:cover;background-repeat:no-repeat;width:${width};height:${height};aspect-ratio:${aspectRatio};"></div>
</div>`;
		}

		return linkEl.outerHTML;
	},
};
