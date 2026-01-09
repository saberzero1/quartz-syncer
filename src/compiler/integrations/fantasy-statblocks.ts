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
// Quartz fixes
.statblock {
  .statblock-item-container div {
    display: inline;
    &.tapered-rule,
    span.statblock-table-header {
      display: block;
    }
    &.statblock-table {
      display: flex;
    }
    &.traits {
      font-family: var(--active-traits-font);
      color: var(--active-traits-font-color);
      font-size: var(--active-traits-font-size);
      font-weight: var(--active-traits-font-weight);
      font-style: var(--active-traits-font-style);
    }
  }
  p {
    color: inherit;
    display: inline;
    font: inherit;
  }
}
// Quartz fixes end

:root {
  --statblock-primary-color: #7a200d;
  --statblock-rule-color: #922610;
  --statblock-background-color: #fdf1dc;

  --statblock-bar-color: #e69a28;
  --statblock-bar-border-size: 1px;
  --statblock-bar-border-color: #000;

  --statblock-image-width: 75px;
  --statblock-image-height: 75px;
  --statblock-image-border-size: 2px;
  --statblock-image-border-color: var(--statblock-primary-color);

  --statblock-border-size: 1px;
  --statblock-border-color: #ddd;

  --statblock-box-shadow-color: #ddd;
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

  --statblock-table-header-font-weight: bold;

  --statblock-traits-name-font-weight: bold;
  --statblock-traits-name-font-style: italic;

  --statblock-link-style: italic;
}

.statblock-item-container {
  margin-bottom: 0.25rem;
}

.statblock-item-inline {
  display: flex;
  justify-content: space-between;
}

.statblock {
  --active-primary-color: var(--statblock-primary-color);
  --active-rule-color: var(--statblock-rule-color);
  --active-background-color: var(--statblock-background-color);

  --active-bar-color: var(--statblock-bar-color);
  --active-bar-border-size: var(--statblock-bar-border-size);
  --active-bar-border-color: var(--statblock-bar-border-color);

  --active-image-width: var(--statblock-image-width);
  --active-image-height: var(--statblock-image-height);
  --active-image-border-size: var(--statblock-image-border-size);
  --active-image-border-color: var(--statblock-image-border-color, var(--active-primary-color));

  --active-border-size: var(--statblock-border-size);
  --active-border-color: var(--statblock-border-color);

  --active-box-shadow-color: var(--statblock-box-shadow-color);
  --active-box-shadow-x-offset: var(--statblock-box-shadow-x-offset);
  --active-box-shadow-y-offset: var(--statblock-box-shadow-y-offset);
  --active-box-shadow-blur: var(--statblock-box-shadow-blur);

  --active-font-color: var(--statblock-font-color, var(--active-primary-color));
  --active-font-weight: var(--statblock-font-weight);

  --active-content-font: var(--statblock-content-font);
  --active-content-font-size: var(--statblock-content-font-size);

  --active-heading-font: var(--statblock-heading-font);
  --active-heading-font-color: var(--statblock-heading-font-color);
  --active-heading-font-size: var(--statblock-heading-font-size);
  --active-heading-font-variant: var(--statblock-heading-font-variant);
  --active-heading-font-weight: var(--statblock-heading-font-weight);
  --active-heading-line-height: var(--statblock-heading-line-height);

  --active-property-line-height: var(--statblock-property-line-height);
  --active-property-font: var(--statblock-property-font);
  --active-property-font-color: var(--statblock-property-font-color);
  --active-property-font-variant: var(--statblock-property-font-variant);
  --active-property-font-size: var(--statblock-property-font-size);
  --active-property-font-weight: var(--statblock-property-font-weight);

  --active-property-name-font: var(--statblock-property-name-font);
  --active-property-name-font-color: var(--statblock-property-name-font-color);
  --active-property-name-font-variant: var(--statblock-property-name-font-variant);
  --active-property-name-font-size: var(--statblock-property-name-font-size);
  --active-property-name-font-weight: var(--statblock-property-name-font-weight);

  --active-section-heading-border-size: var(--statblock-section-heading-border-size);
  --active-section-heading-border-color: var(--statblock-section-heading-border-color);
  --active-section-heading-font: var(--statblock-section-heading-font);
  --active-section-heading-font-color: var(--statblock-section-heading-font-color);
  --active-section-heading-font-size: var(--statblock-section-heading-font-size);
  --active-section-heading-font-variant: var(--statblock-section-heading-font-variant);
  --active-section-heading-font-weight: var(--statblock-section-heading-font-weight);

  --active-saves-line-height: var(--statblock-saves-line-height);

  --active-spells-font-style: var(--statblock-spells-font-style);

  --active-subheading-font: var(--statblock-subheading-font);
  --active-subheading-font-color: var(--statblock-subheading-font-color);
  --active-subheading-font-size: var(--statblock-subheading-font-size);
  --active-subheading-font-style: var(--statblock-subheading-font-style);
  --active-subheading-font-weight: var(--statblock-subheading-font-weight);

  --active-table-header-font-weight: var(--statblock-table-header-font-weight);

  --active-traits-font: var(--statblock-traits-font);
  --active-traits-font-color: var(--statblock-traits-font-color);
  --active-traits-font-size: var(--statblock-traits-font-size);
  --active-traits-font-weight: var(--statblock-traits-font-weight);
  --active-traits-font-style: var(--statblock-traits-font-style);
  --active-traits-name-font: var(--statblock-traits-name-font);
  --active-traits-name-font-color: var(--statblock-traits-name-font-color);
  --active-traits-name-font-size: var(--statblock-traits-name-font-size);
  --active-traits-name-font-weight: var(--statblock-traits-name-font-weight);
  --active-traits-name-font-style: var(--statblock-traits-name-font-style);

  --active-link-style: var(--statblock-link-style);

  margin: 0 auto;
  position: relative;

  a {
    font-style: var(--statblock-link-style);
  }
}

.statblock-content-container {
  .statblock-content {
    font-family: var(--active-content-font);
    font-size: var(--active-content-font-size);
    color: var(--active-font-color);
    background-color: var(--active-background-color);
    padding: 0.5em;
    border: var(--active-border-size) var(--active-border-color) solid;
    box-shadow: var(--active-box-shadow-x-offset)
      var(--active-box-shadow-y-offset) var(--active-box-shadow-blur)
      var(--active-box-shadow-color);
    margin-left: 2px;
    margin-right: 2px;
    display: flex;
    gap: 1rem;

    > .column {
      width: var(--statblock-column-width, 400px);
    }

    @media screen and (max-width: 400px) {
      > .column {
        width: 75vw;
      }
    }
  }
}

.bar {
  height: 5px;
  background: var(--active-bar-color);
  border: var(--active-bar-border-size) solid var(--active-bar-border-color);
  z-index: 1;
  width: auto;
}

.heading,
.statblock-heading {
  font-family: var(--active-heading-font);
  color: var(--active-heading-font-color);
  font-weight: var(--active-heading-font-weight);
  font-variant: var(--active-heading-font-variant);
  font-size: var(--active-heading-font-size);
  line-height: var(--active-heading-line-height);
  margin: 0px;
  letter-spacing: 1px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.flex-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subheading {
  font-weight: var(--active-subheading-font-weight);
  font-style: var(--active-subheading-font-style);
  font-size: var(--active-subheading-font-size);
  font-family: var(--active-subheading-font-family);
  color: var(--active-subheading-font-color);
  margin: 0;
}

.line {
  line-height: var(--active-property-line-height);
  display: block;
  font-family: var(--active-property-font);
  color: var(--active-property-font-color);
  font-variant: var(--active-property-font-variant);
  font-size: var(--active-property-font-size);
  font-weight: var(--active-property-font-weight);
}

.property-name {
  margin: 0;
  margin-right: 0.25em;
  display: inline;
  font-family: var(--active-property-name-font);
  color: var(--active-property-name-font-color);
  font-variant: var(--active-property-name-font-variant);
  font-size: var(--active-property-name-font-size);
  font-weight: var(--active-property-name-font-weight);
}

.section-header {
  border-bottom: var(--active-section-heading-border-size) solid var(--active-section-heading-border-color);
  color: var(--active-section-heading-font-color);
  font-size: var(--active-section-heading-font-size);
  font-variant: var(--active-section-heading-font-variant);
  font-weight: var(--active-section-heading-font-weight);
  font-family: var(--active-section-heading-font);
  letter-spacing: 1px;
  margin: 0;
  margin-bottom: 0.3em;
  break-inside: avoid-column;
  break-after: avoid-column;
}

.tapered-rule {
  width: auto;
  margin: 0.5em 0;
  height: 5px;
  background: linear-gradient(
    90deg,
    var(--active-rule-color) 0%,
    var(--active-rule-color) 50%,
    var(--active-background-color) 95%,
    var(--active-background-color) 100%
  );
  clip-path: polygon(0 0, 0 100%, 95% 50%);
}

.trait {
  font-family: var(--active-traits-font);
  color: var(--active-traits-font-color);
  font-size: var(--active-traits-font-size);
  font-weight: var(--active-traits-font-weight);
  font-style: var(--active-traits-font-style);
}

.trait-name {
  font-family: var(--active-traits-name-font);
  color: var(--active-traits-name-font-color);
  font-size: var(--active-traits-name-font-size);
  font-weight: var(--active-traits-name-font-weight);
  font-style: var(--active-traits-name-font-style);
}

.statblock-nested-traits {
  margin-left: 1rem;
}

.statblock-table {
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  flex-wrap: wrap;
}

.table-item {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-flow: column nowrap;
}

.statblock-table-header {
  font-weight: var(--active-table-header-font-weight);
}

.calculated-modifier::before {
  content: "(";
}

.calculated-modifier::after {
  content: ")";
}

.info {
  .line {
    line-height: var(--active-saves-line-height);
    display: block;
    color: var(--active-font-color);

    .property-name {
      color: var(--active-property-name-font-color);
      margin: 0;
      margin-right: 0.25em;
      display: inline;
      font-weight: bold;
    }

    .property-text {
      display: inline;
      margin: 0;
    }
  }
}

.save-entry,
.save-name,
.save-value {
  display: inline;
}

.save-entry:not(:last-child) .save-value::after {
  content: ", ";
}

.image {
  width: var(--active-image-width);
  height: var(--active-image-height);

  &.pointer {
    cursor: pointer;
  }

  img {
    object-fit: cover;
    width: 100%;
    height: 100%;
    border-radius: 100%;
    border: var(--active-image-border-size) solid var(--active-image-border-color);
    object-position: center;
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
