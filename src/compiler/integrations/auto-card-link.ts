import { parseYaml, getLinkpath, Notice } from "obsidian";
import Logger from "js-logger";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
	QuartzAssets,
} from "./types";
import { isPluginEnabled, sanitizeHTMLToString } from "src/utils/utils";
import { AUTO_CARD_LINK_PLUGIN_ID } from "src/ui/suggest/constants";

const autoCardLinkScss = `
.auto-card-link-container {
  background-color: transparent;
  container-type: inline-size;
  position: relative;
  overflow: hidden;
  user-select: none;
  --auto-card-link-button-width: calc(var(--icon-size, 18px) + var(--size-2-3, 6px));
  --auto-card-link-indent-size: 2.5em;

  @for $i from 1 through 7 {
    &[data-auto-card-link-depth="#{$i}"] {
      margin-left: calc(var(--auto-card-link-indent-size) * #{$i});
    }
  }
}

.auto-card-link-title {
  white-space: normal !important;
  --lh: 1.5em;
  line-height: var(--lh);
  height: calc(var(--lh) * 3);
  overflow: hidden;
  text-overflow: ellipsis;
}

.auto-card-link-card {
  display: flex;
  flex-direction: row-reverse;
  height: 8em;
  transition: 20ms ease-in;
  cursor: pointer;
  text-decoration: none;
  color: var(--link-external-color, var(--highlight));
  background: var(--background-primary-alt, var(--darkgray));
  border: solid var(--border-width) var(--divider-color, var(--lightgray));
  border-radius: var(--radius-s, 4px);

  &:hover {
    color: var(--link-external-color-hover, var(--tertiary));
  }
}

.auto-card-link-main {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.18em;
  padding: 0.5em 0.6em;
  overflow: hidden;
  text-align: left;
}

.auto-card-link-description {
  overflow: hidden;
  --lh: 1.4em;
  line-height: var(--lh);
  height: calc(var(--lh) * 3);
  color: var(--text-muted, var(--darkgray));
  font-size: var(--font-smallest, 0.9em);
}

.auto-card-link-host {
  font-size: var(--font-smallest, 0.9em);
  display: flex;
  flex-direction: row;
  align-items: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-card-link-thumbnail {
  margin: 0;
  width: unset !important;
  max-height: 100%;
  object-fit: cover;
}

.auto-card-link-error-container {
  color: var(--text-error);
  padding: 0.5em;
  border: 1px solid var(--text-error);
  border-radius: var(--radius-s, 4px);
}
`;

interface LinkMetadata {
	url: string;
	title: string;
	description?: string;
	host?: string;
	favicon?: string;
	image?: string;
	indent: number;
}

class YamlParseError extends Error {}
class NoRequiredParamsError extends Error {}

const urlRegex =
	/^(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/i;

function isUrl(text: string): boolean {
	return new RegExp(urlRegex).test(text);
}

function parseLinkMetadataFromYaml(source: string): LinkMetadata {
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
		Logger.error(error);
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

function genErrorEl(errorMsg: string): HTMLElement {
	const containerEl = createEl("div");
	containerEl.addClass("auto-card-link-error-container");

	const spanEl = createEl("span");
	spanEl.textContent = `cardlink error: ${errorMsg}`;
	containerEl.appendChild(spanEl);

	return containerEl;
}

function genLinkEl(
	data: LinkMetadata,
	app: CompileContext["app"],
): HTMLElement {
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
		let imageSrc = data.image;

		if (!isUrl(imageSrc)) {
			const link = imageSrc.slice(2, -2);

			const imageRelativePath = app.metadataCache.getFirstLinkpathDest(
				getLinkpath(link),
				"",
			)?.path;

			if (imageRelativePath) {
				imageSrc = app.vault.adapter.getResourcePath(imageRelativePath);
			}
		}

		const thumbnailEl = createEl("img");
		thumbnailEl.addClass("auto-card-link-thumbnail");
		thumbnailEl.setAttr("src", imageSrc);
		thumbnailEl.setAttr("draggable", "false");
		cardEl.appendChild(thumbnailEl);
	}

	return containerEl;
}

export const AutoCardLinkIntegration: PluginIntegration = {
	id: "auto-card-link",
	name: "Auto Card Link",
	settingKey: "useAutoCardLink",
	priority: 100,

	assets: {
		scss: autoCardLinkScss,
	} as QuartzAssets,

	isAvailable(): boolean {
		return isPluginEnabled(AUTO_CARD_LINK_PLUGIN_ID);
	},

	getPatterns(): PatternDescriptor[] {
		return [
			{
				id: "cardlink",
				pattern: /```cardlink\s(.+?)```/gms,
				type: "block",
			},
		];
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const query = match.captures[0];

		if (!query) return match.fullMatch;

		const serializer = new XMLSerializer();

		try {
			const div = createEl("div");

			try {
				const data = parseLinkMetadataFromYaml(query);
				div.appendChild(genLinkEl(data, context.app));
			} catch (error) {
				if (error instanceof NoRequiredParamsError) {
					div.appendChild(genErrorEl(error.message));
				} else if (error instanceof YamlParseError) {
					div.appendChild(genErrorEl(error.message));
				} else if (error instanceof TypeError) {
					div.appendChild(
						genErrorEl(
							"internal links must be surrounded by quotes.",
						),
					);
					Logger.error(error);
				} else {
					Logger.error("Code Block: cardlink unknown error", error);
				}

				return sanitizeHTMLToString(div, serializer);
			}

			return sanitizeHTMLToString(div, serializer);
		} catch (error) {
			Logger.error(error);
			new Notice(`Quartz Syncer: Auto Card Link error: ${error}`);

			return match.fullMatch;
		}
	},
};
