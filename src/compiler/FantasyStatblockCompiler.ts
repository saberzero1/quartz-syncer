import { App, Component, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { isPluginEnabled, delay } from "src/utils/utils";
import { fantasyStatblock } from "src/utils/styles";
import Logger from "js-logger";

/**
 * FantasyStatblockCompiler is responsible for compiling FantasyStatblocks queries
 * in the text of a PublishFile.
 *
 * It replaces the queries with their rendered results and injects the necessary CSS
 * for the FantasyStatblock renders.
 * It uses the FantasyStatblock API to render the queries.
 *
 * Documentation: {@link https://plugins.javalent.com/statblocks}
 */
export class FantasyStatblockCompiler {
	app: App;
	fantasyStatblockApi: FantasyStatblockApi | undefined;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.fantasyStatblockApi = getFantasyStatblockApi();
		this.serializer = new XMLSerializer();
	}

	/**
	 * Compiles the text by replacing FantasyStatblocks queries with their results.
	 * It also injects the necessary CSS for the FantasyStatblock renders.
	 *
	 * @param file - The PublishFile object representing the file being compiled.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 * @throws If the FantasyStatblock API is not available, a notice is shown to the user.
	 */
	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;
		let injectCSS = false;

		if (!this.fantasyStatblockApi) return text;

		const fantasyStatblockApi = this.fantasyStatblockApi;

		const fantasyStatblockRegex = /(```statblock\s.+?```)/gms;

		const fantasyStatblockMatches = text.matchAll(fantasyStatblockRegex);

		if (!fantasyStatblockMatches) return text;

		for (const statblock of fantasyStatblockMatches) {
			const query = statblock[1].trim();

			if (!query) continue;

			try {
				const renderedDiv = await tryRenderStatblock(
					query,
					file,
					fantasyStatblockApi,
				);

				if (renderedDiv) {
					// Remove redunant elements
					const selectorsToRemove = [
						".clickable-icon.extra-setting-button",
						".statblock-inline-item.action-container",
					];

					selectorsToRemove.forEach((selector) => {
						const elements = renderedDiv.querySelectorAll(selector);
						elements.forEach((el) => el.remove());
					});

					// Wrap all modifiers textConetn in parantheses
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
				new Notice(`FantasyStatblock execution error: ${error}`);
			}
		}

		if (injectCSS) {
			// Inject the CSS for FantasyStatblock renders
			replacedText += `

<style>${fantasyStatblock}</style>
`;
		}

		return replacedText;
	};
}

/**
 * Gets the FantasyStatblock API from the window object if the plugin is enabled.
 * If the plugin is not enabled, it returns undefined.
 *
 * Relevant documentation: {@link https://blacksmithgu.github.io/datacore/code-views}
 *
 * @returns The FantasyStatblockApi instance or undefined if the plugin is not enabled.
 */
function getFantasyStatblockApi(): FantasyStatblockApi | undefined {
	if (isPluginEnabled("obsidian-5e-statblocks")) {
		//@ts-expect-error If datacore is enabled, it should be available on the window object
		return window.FantasyStatblocks as FantasyStatblockApi;
	}

	return undefined;
}

/**
 * Attempts to execute a DatacoreJS query and returns the result as an HTMLDivElement.
 * If the execution fails, it tries to execute the query as a DatacoreJSX query.
 *
 * @param query - The FantasyStatblock query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param fantasyStatblockApi - The FantasyStatblockApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryRenderStatblock(
	query: string,
	file: PublishFile,
	fantasyStatblockApi: FantasyStatblockApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		fantasyStatblockApi.renderMarkdown(
			query,
			div,
			file.getPath(),
			component,
		);
	} catch (error) {
		Logger.error(error);

		new Notice(`DatacoreJS execution error: ${error}, trying JSX...`);

		return div;
	}
	let counter = 0;

	while (!div.querySelector(".statblock") && counter < 100) {
		await delay(5);
		counter++;
	}

	return div;
}

/**
 * FantasyStatblockApi is a class that provides methods to render FantasyStatblocks queries
 * using the FantasyStatblock API.
 * These mappings match the FantasyStatblock Obsidian plugin.
 */
declare class FantasyStatblockApi {
	fantasyStatblockApi: FantasyStatblockApi;
	constructor(fantasyStatblockApi: FantasyStatblockApi);

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
