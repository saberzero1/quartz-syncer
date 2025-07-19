import { App, parseYaml, Notice, getLinkpath } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { isPluginEnabled, sanitizeHTMLToString } from "src/utils/utils";
import { autoCardLink } from "src/utils/styles";
import Logger from "js-logger";
import { AUTO_CARD_LINK_PLUGIN_ID } from "src/ui/suggest/constants";

export class AutoCardLinkCompiler {
	app: App;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.serializer = new XMLSerializer();
	}

	compile: TCompilerStep = (_file) => async (text) => {
		let replacedText = text;

		if (!isPluginEnabled(AUTO_CARD_LINK_PLUGIN_ID)) return text;

		let injectCardCSS = false;

		const autoCardLinkRegex = /```cardlink\s(.+?)```/gms;

		const autoCardLinkMatches = text.matchAll(autoCardLinkRegex);

		for (const cardLink of autoCardLinkMatches) {
			try {
				const block = cardLink[0];
				const query = cardLink[1];

				if (!query) continue;

				try {
					const renderedDiv = await this.tryRenderCardLink(query);
					injectCardCSS = true;

					replacedText = replacedText.replace(
						block,
						sanitizeHTMLToString(renderedDiv, this.serializer),
					);
				} catch (error) {
					Logger.error("Auto Card Link Compiler error", error);
				}
			} catch (error) {
				console.log(error);

				new Notice(`Quartz Syncer: DatacoreTSX query error: ${error}`);

				return cardLink[0];
			}
		}

		const injectCSS = injectCardCSS
			? `

<style>${autoCardLink}</style>
`
			: "";

		return replacedText + injectCSS;
	};

	async tryRenderCardLink(source: string) {
		const div = createEl("div");

		try {
			const data = this.parseLinkMetadataFromYaml(source);
			div.appendChild(this.genLinkEl(data));
		} catch (error) {
			if (error instanceof NoRequiredParamsError) {
				div.appendChild(this.genErrorEl(error.message));
			} else if (error instanceof YamlParseError) {
				div.appendChild(this.genErrorEl(error.message));
			} else if (error instanceof TypeError) {
				div.appendChild(
					this.genErrorEl(
						"internal links must be surrounded by" + " quotes.",
					),
				);
				console.log(error);
			} else {
				console.log("Code Block: cardlink unknown error", error);
			}

			return div;
		}

		return div;
	}

	private parseLinkMetadataFromYaml(source: string): LinkMetadata {
		let yaml: Partial<LinkMetadata>;

		let indent = -1;

		source = source
			.split(/\r?\n|\r|\n/g)
			.map((line) =>
				line.replace(/^\t+/g, (tabs) => {
					const n = tabs.length;

					if (indent < 0) {
						indent = n;
					}

					return " ".repeat(n);
				}),
			)
			.join("\n");

		try {
			yaml = parseYaml(source) as Partial<LinkMetadata>;
		} catch (error) {
			console.log(error);
			throw new YamlParseError(
				"failed to parse yaml. Check debug console for more detail.",
			);
		}

		if (!yaml || !yaml.url || !yaml.title) {
			throw new NoRequiredParamsError(
				"required params[url, title] are not found.",
			);
		}

		return {
			url: yaml.url,
			title: yaml.title,
			description: yaml.description,
			host: yaml.host,
			favicon: yaml.favicon,
			image: yaml.image,
			indent,
		};
	}

	private genErrorEl(errorMsg: string): HTMLElement {
		const containerEl = createEl("div");
		containerEl.addClass("auto-card-link-error-container");

		const spanEl = createEl("span");
		spanEl.textContent = `cardlink error: ${errorMsg}`;
		containerEl.appendChild(spanEl);

		return containerEl;
	}

	private genLinkEl(data: LinkMetadata): HTMLElement {
		const containerEl = createEl("div");
		containerEl.addClass("auto-card-link-container");
		containerEl.setAttr("data-auto-card-link-depth", data.indent);

		const cardEl = createEl("a");
		cardEl.addClass("auto-card-link-card");
		cardEl.setAttr("href", data.url);
		containerEl.appendChild(cardEl);

		const mainEl = createEl("div");
		mainEl.addClass("auto-card-link-main");
		cardEl.appendChild(mainEl);

		const titleEl = createEl("div");
		titleEl.addClass("auto-card-link-title");
		titleEl.textContent = data.title;
		mainEl.appendChild(titleEl);

		if (data.description) {
			const descriptionEl = createEl("div");
			descriptionEl.addClass("auto-card-link-description");
			descriptionEl.textContent = data.description;
			mainEl.appendChild(descriptionEl);
		}

		const hostEl = createEl("div");
		hostEl.addClass("auto-card-link-host");
		mainEl.appendChild(hostEl);

		if (data.host) {
			const hostNameEl = createEl("span");
			hostNameEl.textContent = data.host;
			hostEl.appendChild(hostNameEl);
		}

		if (data.image) {
			if (!CheckIf.isUrl(data.image))
				data.image = this.getLocalImagePath(data.image);

			const thumbnailEl = createEl("img");
			thumbnailEl.addClass("auto-card-link-thumbnail");
			thumbnailEl.setAttr("src", data.image);
			thumbnailEl.setAttr("draggable", "false");
			cardEl.appendChild(thumbnailEl);
		}

		return containerEl;
	}

	private getLocalImagePath(link: string): string {
		link = link.slice(2, -2); // remove [[]]

		const imageRelativePath = this.app.metadataCache.getFirstLinkpathDest(
			getLinkpath(link),
			"",
		)?.path;

		if (!imageRelativePath) return link;

		return this.app.vault.adapter.getResourcePath(imageRelativePath);
	}
}

class YamlParseError extends Error {}
class NoRequiredParamsError extends Error {}

interface LinkMetadata {
	url: string;
	title: string;
	description?: string;
	host?: string;
	favicon?: string;
	image?: string;
	indent: number;
}

const urlRegex =
	/^(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/i;

const linkRegex =
	/^\[([^[\]]*)\]\((https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})\)$/i;
const imageRegex = /\.(gif|jpe?g|tiff?|png|webp|bmp|tga|psd|ai)$/i;

class CheckIf {
	static isUrl(text: string): boolean {
		const regex = new RegExp(urlRegex);

		return regex.test(text);
	}

	static isImage(text: string): boolean {
		const regex = new RegExp(imageRegex);

		return regex.test(text);
	}

	static isLinkedUrl(text: string): boolean {
		const regex = new RegExp(linkRegex);

		return regex.test(text);
	}
}
