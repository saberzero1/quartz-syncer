import { Component, Notice } from "obsidian";
import Logger from "js-logger";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
	QuartzAssets,
} from "./types";
import { isPluginEnabled, renderPromise } from "src/utils/utils";
import { FANTASY_STATBLOCKS_PLUGIN_ID } from "src/ui/suggest/constants";

const fantasyStatblocksScss = `
:root {
  --statblock-primary-color: rgb(122, 32, 13);
  --statblock-rule-color: rgb(146, 38, 16);
  --statblock-background-color: rgb(253, 241, 220);
  --statblock-bar-color: rgb(230, 154, 40);
  --statblock-bar-border-size: 1px;
  --statblock-bar-border-color: black;
  --statblock-image-width: 75px;
  --statblock-image-height: 75px;
  --statblock-image-border-size: 2px;
  --statblock-image-border-color: var(--statblock-primary-color);
  --statblock-border-size: 1px;
  --statblock-border-color: rgb(221, 221, 221);
  --statblock-box-shadow-color: rgb(221, 221, 221);
  --statblock-box-shadow-x-offset: 0;
  --statblock-box-shadow-y-offset: 0;
  --statblock-box-shadow-blur: 1.5em;
  --statblock-font-color: var(--statblock-primary-color);
  --statblock-font-weight: 700;
  --statblock-content-font: "Noto Sans", "Myriad Pro", Calibri, Helvetica, Arial, sans-serif;
  --statblock-content-font-size: 14px;
  --statblock-heading-font: "Libre Baskerville", "Lora", "Calisto MT", "Bookman Old Style", Bookman, "Goudy Old Style", Garamond, "Hoefler Text", "Bitstream Charter", Georgia, serif;
  --statblock-heading-font-color: var(--statblock-font-color);
  --statblock-heading-font-size: 23px;
  --statblock-heading-font-variant: small-caps;
  --statblock-heading-font-weight: var(--statblock-font-weight);
  --statblock-heading-line-height: inherit;
  --statblock-property-line-height: 1.4;
  --statblock-property-font-color: var(--statblock-font-color);
  --statblock-property-name-font-color: var(--statblock-font-color);
  --statblock-property-name-font-weight: bold;
  --statblock-section-heading-border-size: 1px;
  --statblock-section-heading-border-color: var(--statblock-primary-color);
  --statblock-section-heading-font-color: var(--statblock-font-color);
  --statblock-section-heading-font-size: 21px;
  --statblock-section-heading-font-variant: small-caps;
  --statblock-section-heading-font-weight: normal;
  --statblock-saves-line-height: 1.4;
  --statblock-spells-font-style: italic;
  --statblock-subheading-font-size: 12px;
  --statblock-subheading-font-style: italic;
  --statblock-subheading-font-weight: normal;
  --statblock-traits-font-weight: bold;
  --statblock-traits-font-style: italic;
}

.statblock {
  font-family: var(--statblock-content-font);
  font-size: var(--statblock-content-font-size);
  color: var(--statblock-font-color);
  background-color: var(--statblock-background-color);
  border: var(--statblock-border-size) solid var(--statblock-border-color);
  box-shadow: var(--statblock-box-shadow-x-offset) var(--statblock-box-shadow-y-offset) var(--statblock-box-shadow-blur) var(--statblock-box-shadow-color);
  padding: 1em;
  margin: 1em 0;

  .statblock-name {
    font-family: var(--statblock-heading-font);
    font-size: var(--statblock-heading-font-size);
    font-variant: var(--statblock-heading-font-variant);
    font-weight: var(--statblock-heading-font-weight);
    color: var(--statblock-heading-font-color);
    line-height: var(--statblock-heading-line-height);
  }

  .statblock-bar {
    background-color: var(--statblock-bar-color);
    border: var(--statblock-bar-border-size) solid var(--statblock-bar-border-color);
    height: 5px;
    margin: 0.5em 0;
  }

  .statblock-property-line {
    line-height: var(--statblock-property-line-height);
    color: var(--statblock-property-font-color);

    .property-name {
      font-weight: var(--statblock-property-name-font-weight);
      color: var(--statblock-property-name-font-color);
    }
  }

  .statblock-section-heading {
    font-family: var(--statblock-heading-font);
    font-size: var(--statblock-section-heading-font-size);
    font-variant: var(--statblock-section-heading-font-variant);
    font-weight: var(--statblock-section-heading-font-weight);
    color: var(--statblock-section-heading-font-color);
    border-bottom: var(--statblock-section-heading-border-size) solid var(--statblock-section-heading-border-color);
  }

  .statblock-traits {
    .trait-name {
      font-weight: var(--statblock-traits-font-weight);
      font-style: var(--statblock-traits-font-style);
    }
  }

  .statblock-image {
    width: var(--statblock-image-width);
    height: var(--statblock-image-height);
    border: var(--statblock-image-border-size) solid var(--statblock-image-border-color);
    object-fit: cover;
  }
}
`;

interface FantasyStatblocksApi {
	renderMarkdown(
		markdown: string,
		el: HTMLElement,
		source: string,
		component: Component,
	): Promise<void>;
}

function getFantasyStatblocksApi(): FantasyStatblocksApi | undefined {
	if (isPluginEnabled(FANTASY_STATBLOCKS_PLUGIN_ID)) {
		// @ts-expect-error FantasyStatblocks exposes API on window when enabled
		return window.FantasyStatblocks as FantasyStatblocksApi;
	}

	return undefined;
}

async function tryRenderStatblock(
	query: string,
	filePath: string,
	api: FantasyStatblocksApi,
): Promise<HTMLDivElement> {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		api.renderMarkdown(query, div, filePath, component);
	} catch (error) {
		Logger.error(error);

		new Notice(
			`Quartz Syncer: Fantasy Statblocks execution error: ${error}.`,
		);

		return div;
	}

	await renderPromise(div, ".statblock", 5000);

	return div;
}

export const FantasyStatblocksIntegration: PluginIntegration = {
	id: "fantasy-statblocks",
	name: "Fantasy Statblocks",
	settingKey: "useFantasyStatblocks",
	priority: 100,

	assets: {
		scss: fantasyStatblocksScss,
	} as QuartzAssets,

	isAvailable(): boolean {
		return !!getFantasyStatblocksApi();
	},

	getPatterns(): PatternDescriptor[] {
		return [
			{
				id: "statblock",
				pattern: /(```statblock\s.+?```)/gms,
				type: "block",
			},
		];
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const api = getFantasyStatblocksApi();

		if (!api) return match.fullMatch;

		const query = match.fullMatch.trim();

		if (!query) return match.fullMatch;

		try {
			const renderedDiv = await tryRenderStatblock(
				query,
				context.file.getPath(),
				api,
			);

			const selectorsToRemove = [
				".clickable-icon.extra-setting-button",
				".statblock-inline-item.action-container",
			];

			selectorsToRemove.forEach((selector) => {
				renderedDiv
					.querySelectorAll(selector)
					.forEach((el) => el.remove());
			});

			const modifiers = renderedDiv.querySelectorAll(
				"span.calculated-modifier",
			);

			modifiers.forEach((modifier) => {
				if (modifier.textContent) {
					modifier.textContent = `(${modifier.textContent})`;
				}
			});

			const serializer = new XMLSerializer();
			const renderedHTML = serializer.serializeToString(renderedDiv);

			return renderedHTML.replace(
				' xmlns="http://www.w3.org/1999/xhtml"',
				"",
			);
		} catch (error) {
			Logger.error(error);

			return match.fullMatch;
		}
	},
};
