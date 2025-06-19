import { App, Component, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { isPluginEnabled, renderPromise } from "src/utils/utils";
import { fantasyStatblocks } from "src/utils/styles";
import Logger from "js-logger";
import { FANTASY_STATBLOCKS_PLUGIN_ID } from "src/ui/suggest/constants";

/**
 * FantasyStatblocksCompiler is responsible for compiling FantasyStatblocks queries
 * in the text of a PublishFile.
 *
 * It replaces the queries with their rendered results and injects the necessary CSS
 * for the FantasyStatblocks renders.
 * It uses the FantasyStatblocks API to render the queries.
 *
 * Documentation: {@link https://plugins.javalent.com/statblocks}
 */
export class FantasyStatblocksCompiler {
	app: App;
	fantasyStatblocksApi: FantasyStatblocksApi | undefined;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.fantasyStatblocksApi = getFantasyStatblocksApi();
		this.serializer = new XMLSerializer();
	}

	/**
	 * Compiles the text by replacing FantasyStatblocks queries with their results.
	 * It also injects the necessary CSS for the FantasyStatblocks renders.
	 *
	 * @param file - The PublishFile object representing the file being compiled.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 * @throws If the FantasyStatblocks API is not available, a notice is shown to the user.
	 */
	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;
		let injectCSS = false;

		if (!this.fantasyStatblocksApi) return text;

		const fantasyStatblocksApi = this.fantasyStatblocksApi;

		const fantasyStatblocksRegex = /(```statblock\s.+?```)/gms;

		const fantasyStatblocksMatches = text.matchAll(fantasyStatblocksRegex);

		for (const statblock of fantasyStatblocksMatches) {
			const query = statblock[1].trim();

			if (!query) continue;

			try {
				const renderedDiv = await tryRenderStatblock(
					query,
					file,
					fantasyStatblocksApi,
				);

				if (renderedDiv) {
					// Remove redundant elements
					const selectorsToRemove = [
						".clickable-icon.extra-setting-button",
						".statblock-inline-item.action-container",
					];

					selectorsToRemove.forEach((selector) => {
						const elements = renderedDiv.querySelectorAll(selector);
						elements.forEach((el) => el.remove());
					});

					// Wrap all modifiers textContent in parentheses
					const modifiers = renderedDiv.querySelectorAll(
						"span.calculated-modifier",
					);

					// Apply `::before` and `::after` styles directly
					modifiers.forEach((modifier) => {
						if (modifier.textContent) {
							modifier.textContent = `(${modifier.textContent})`;
						}
					});

					injectCSS = true;

					const renderedHTML =
						this.serializer.serializeToString(renderedDiv);

					replacedText = replacedText.replace(
						statblock[0],
						renderedHTML.replace(
							' xmlns="http://www.w3.org/1999/xhtml"',
							"",
						),
					);
				}
			} catch (error) {
				Logger.error(error);

				new Notice(
					`Quartz Syncer: FantasyStatblocks execution error: ${error}`,
				);
			}
		}

		if (injectCSS) {
			// Inject the CSS for FantasyStatblocks renders
			replacedText += `

<style>${fantasyStatblocks}</style>
`;
		}

		return replacedText;
	};
}

/**
 * Gets the FantasyStatblocks API from the window object if the plugin is enabled.
 * If the plugin is not enabled, it returns undefined.
 *
 * Relevant documentation: {@link https://plugins.javalent.com/statblocks}
 *
 * @returns The FantasyStatblockApi instance or undefined if the plugin is not enabled.
 */
function getFantasyStatblocksApi(): FantasyStatblocksApi | undefined {
	if (isPluginEnabled(FANTASY_STATBLOCKS_PLUGIN_ID)) {
		//@ts-expect-error If Fantasy Statblocks is enabled, it should be available on the window object
		return window.FantasyStatblocks as FantasyStatblocksApi;
	}

	return undefined;
}

/**
 * Attempts to execute a Fantasy Statblocks query and returns the result as an HTMLDivElement.
 *
 * @param query - The FantasyStatblocks query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param fantasyStatblocksApi - The FantasyStatblockApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryRenderStatblock(
	query: string,
	file: PublishFile,
	fantasyStatblocksApi: FantasyStatblocksApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		fantasyStatblocksApi.renderMarkdown(
			query,
			div,
			file.getPath(),
			component,
		);
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

/**
 * FantasyStatblockApi is a class that provides methods to render FantasyStatblocks queries
 * using the FantasyStatblocks API.
 * These mappings match the FantasyStatblocks Obsidian plugin.
 */
declare class FantasyStatblocksApi {
	fantasyStatblocksApi: FantasyStatblocksApi;
	constructor(fantasyStatblockApi: FantasyStatblocksApi);

	/**
	 * Renders markdown string to an HTML element using Obsidian's Markdown renderer.
	 * @param markdown - The markdown source code
	 * @param el - The element to append to
	 * @param sourcePath - The normalized path of this markdown file, used to resolve relative internal links
	 * @param component - A parent component to manage the lifecycle of the rendered child components.
	 */
	renderMarkdown(
		markdown: string,
		el: HTMLElement,
		source: string,
		component: Component,
	): Promise<void>;
}
