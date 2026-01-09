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

:root[saved-theme="light"] .excalidraw-svg.excalidraw-light {
  display: block;
}

:root[saved-theme="dark"] .excalidraw-svg.excalidraw-dark {
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

interface EmbeddedFilesLoader {
	terminate: boolean;
	uid: string;
}

interface ExcalidrawAutomate {
	createSVG(
		templatePath?: string,
		embedFont?: boolean,
		exportSettings?: ExportSettings,
		loader?: EmbeddedFilesLoader,
		theme?: string,
		padding?: number,
	): Promise<SVGSVGElement>;
	getEmbeddedFilesLoader(isDark?: boolean): EmbeddedFilesLoader;
	getExportSettings(
		withBackground: boolean,
		withTheme: boolean,
		isMask?: boolean,
	): ExportSettings;
}

declare global {
	interface Window {
		ExcalidrawAutomate: ExcalidrawAutomate;
	}
}

function getExcalidrawAutomate(): ExcalidrawAutomate | undefined {
	if (isPluginEnabled(EXCALIDRAW_PLUGIN_ID) && window.ExcalidrawAutomate) {
		return window.ExcalidrawAutomate;
	}

	return undefined;
}

async function createThemedSVGs(
	path: string,
	ea: ExcalidrawAutomate,
): Promise<{ dark: SVGSVGElement | null; light: SVGSVGElement | null }> {
	try {
		const exportSettings = ea.getExportSettings(false, true);
		const darkLoader = ea.getEmbeddedFilesLoader(true);
		const lightLoader = ea.getEmbeddedFilesLoader(false);

		const svgDark = await ea.createSVG(
			path,
			false,
			exportSettings,
			darkLoader,
			"dark",
		);

		const svgLight = await ea.createSVG(
			path,
			false,
			exportSettings,
			lightLoader,
			"light",
		);

		svgDark.style.maxWidth = "100%";
		svgDark.style.height = "auto";

		svgDark
			.querySelectorAll("style.style-fonts, metadata, mask, defs")
			?.forEach((element) => element.remove());

		svgLight.style.maxWidth = "100%";
		svgLight.style.height = "auto";

		svgLight
			.querySelectorAll("style.style-fonts, metadata, mask, defs")
			?.forEach((element) => element.remove());

		return { dark: svgDark, light: svgLight };
	} catch (e) {
		Logger.error("Failed to create Excalidraw SVGs:", e);

		new Notice(
			"Quartz Syncer: Unable to render Excalidraw drawing. Check console for details.",
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
		return !!getExcalidrawAutomate();
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
		const ea = getExcalidrawAutomate();

		if (!ea) return _text;

		const { dark, light } = await createThemedSVGs(file.file.path, ea);

		if (!dark && !light) {
			return _text;
		}

		return `<div>
<div class="excalidraw-svg excalidraw-dark" style="background-image:url(${svgToData(dark!)});background-size:contain;background-repeat:no-repeat;width:100%;aspect-ratio:${dark!.viewBox.baseVal.width / dark!.viewBox.baseVal.height};"></div>
<div class="excalidraw-svg excalidraw-light" style="background-image:url(${svgToData(light!)});background-size:contain;background-repeat:no-repeat;width:100%;aspect-ratio:${light!.viewBox.baseVal.width / light!.viewBox.baseVal.height};"></div>
</div>`;
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const ea = getExcalidrawAutomate();

		if (!ea) return match.fullMatch;

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

		if (!isEmbedded) {
			const linkEl = createEl("a", {
				text: displayName || linkedFile.basename,
				href: extensionlessPath,
			});

			return linkEl.outerHTML;
		}

		const { dark, light } = await createThemedSVGs(linkedFile.path, ea);

		if (!dark || !light) {
			return match.fullMatch;
		}

		const width = `${dark.viewBox.baseVal.width}px`;

		const aspectRatio =
			dark.viewBox.baseVal.width / dark.viewBox.baseVal.height;

		dark.removeAttribute("width");
		dark.removeAttribute("height");
		dark.removeAttribute("viewBox");
		light.removeAttribute("width");
		light.removeAttribute("height");
		light.removeAttribute("viewBox");

		return `<div>
<div class="excalidraw-svg excalidraw-dark" style="background-image:url(${svgToData(dark)});background-size:cover;background-repeat:no-repeat;width:${width};height:auto;aspect-ratio:${aspectRatio};"></div>
<div class="excalidraw-svg excalidraw-light" style="background-image:url(${svgToData(light)});background-size:cover;background-repeat:no-repeat;width:${width};height:auto;aspect-ratio:${aspectRatio};"></div>
</div>`;
	},
};
