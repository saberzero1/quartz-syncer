import { DatacoreApi } from "@blacksmithgu/datacore/build/library/index";
import { App, Component, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import {
	renderPromise,
	isPluginEnabled,
	sanitizeHTMLToString,
	surroundWithCalloutBlock,
	sanitizeQuery,
} from "src/utils/utils";
import { datacoreCard } from "src/utils/styles";
import Logger from "js-logger";
import { DATACORE_PLUGIN_ID } from "src/ui/suggest/constants";

/**
 * DatacoreCompiler class.
 * This class is responsible for compiling Datacore queries in the text.
 * It uses the Datacore API to execute the queries and replace them with the results.
 * It also handles the callout blocks and CSS injection.
 *
 * Documentation: {@link https://saberzero1.github.io/quartz-syncer-docs/Settings/Integrations/Datacore}
 */
export class DatacoreCompiler {
	app: App;
	datacore: DatacoreApi | undefined;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.datacore = getDatacoreApi();
		this.serializer = new XMLSerializer();
	}

	/**
	 * Compiles the text by replacing Datacore queries with their results.
	 * It also injects the necessary CSS for the Datacore cards.
	 *
	 * @param file - The PublishFile object representing the file being compiled.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 * @throws If the Datacore API is not available, a notice is shown to the user.
	 */
	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;

		if (!this.datacore) return text;

		const dcApi = this.datacore;

		let injectCardCSS = false;

		const dataCoreJsRegex = /```datacorejs\s(.+?)```/gms;
		const dataCoreJsxRegex = /```datacorejsx\s(.+?)```/gms;
		const dataCoreTsRegex = /```datacorets\s(.+?)```/gms;
		const dataCoreTsxRegex = /```datacoretsx\s(.+?)```/gms;

		const jsMatches = text.matchAll(dataCoreJsRegex);
		const jsxMatches = text.matchAll(dataCoreJsxRegex);
		const tsMatches = text.matchAll(dataCoreTsRegex);
		const tsxMatches = text.matchAll(dataCoreTsxRegex);

		if (!jsMatches && !jsxMatches && !tsMatches && !tsxMatches) {
			return text;
		}

		for (const queryBlock of jsMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCalloutDepth, finalQuery } =
					sanitizeQuery(query);

				const queryResult = await tryExecuteJs(finalQuery, file, dcApi);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						surroundWithCalloutBlock(result, isInsideCalloutDepth),
					);
				} else {
					replacedText = replacedText.replace(block, result);
				}
			} catch (error) {
				console.log(error);

				new Notice(`DatacoreJS query error: ${error}`);

				return queryBlock[0];
			}
		}

		for (const queryBlock of jsxMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCalloutDepth, finalQuery } =
					sanitizeQuery(query);

				const queryResult = await tryExecuteJsx(
					finalQuery,
					file,
					dcApi,
				);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						surroundWithCalloutBlock(result, isInsideCalloutDepth),
					);
				} else {
					replacedText = replacedText.replace(block, result);
				}
			} catch (error) {
				console.log(error);

				new Notice(`DatacoreJSX query error: ${error}`);

				return queryBlock[0];
			}
		}

		for (const queryBlock of tsMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCalloutDepth, finalQuery } =
					sanitizeQuery(query);

				const queryResult = await tryExecuteTs(finalQuery, file, dcApi);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						surroundWithCalloutBlock(result, isInsideCalloutDepth),
					);
				} else {
					replacedText = replacedText.replace(block, result);
				}
			} catch (error) {
				console.log(error);

				new Notice(`DatacoreTS query error: ${error}`);

				return queryBlock[0];
			}
		}

		for (const queryBlock of tsxMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCalloutDepth, finalQuery } =
					sanitizeQuery(query);

				const queryResult = await tryExecuteTsx(
					finalQuery,
					file,
					dcApi,
				);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						surroundWithCalloutBlock(result, isInsideCalloutDepth),
					);
				} else {
					replacedText = replacedText.replace(block, result);
				}
			} catch (error) {
				console.log(error);

				new Notice(`DatacoreTSX query error: ${error}`);

				return queryBlock[0];
			}
		}

		const injectCSS = injectCardCSS
			? `

<style>${datacoreCard}</style>
`
			: "";

		return replacedText + injectCSS;
	};
}

/**
 * Gets the Datacore API from the window object if the plugin is enabled.
 * If the plugin is not enabled, it returns undefined.
 *
 * @remarks
 * The method for accessing the Datacore API is based on the documentation provided by the Datacore plugin.
 * This will likely change in the future when the API stabilizes.
 *
 * Relevant documentation: {@link https://blacksmithgu.github.io/datacore/code-views}
 *
 * @returns The DatacoreApi instance or undefined if the plugin is not enabled.
 */
function getDatacoreApi(): DatacoreApi | undefined {
	if (isPluginEnabled(DATACORE_PLUGIN_ID)) {
		//@ts-expect-error If datacore is enabled, it should be available on the window object
		return window.datacore as DatacoreApi;
	}

	return undefined;
}

/**
 * Attempts to execute a DatacoreJS query and returns the result as an HTMLDivElement.
 * If the execution fails, it tries to execute the query as a DatacoreJSX query.
 *
 * @param query - The DatacoreJS query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param dcApi - The DatacoreApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryExecuteJs(
	query: string,
	file: PublishFile,
	dcApi: DatacoreApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		dcApi.executeJs(query, div, component, file.getPath());
	} catch (error) {
		Logger.error(error);

		new Notice(`DatacoreJS execution error: ${error}, trying JSX...`);

		return tryExecuteJsx(query, file, dcApi);
	}

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

/**
 * Attempts to execute a DatacoreJSX query and returns the result as an HTMLDivElement.
 * If the execution fails, it returns the div without any modifications.
 *
 * @param query - The DatacoreJSX query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param dcApi - The DatacoreApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryExecuteJsx(
	query: string,
	file: PublishFile,
	dcApi: DatacoreApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		dcApi.executeJsx(query, div, component, file.getPath());
	} catch (error) {
		Logger.error(error);

		new Notice(`DatacoreJSX execution error: ${error}`);

		return div;
	}

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

/**
 * Attempts to execute a DatacoreTS query and returns the result as an HTMLDivElement.
 * If the execution fails, it tries to execute the query as a DatacoreTSX query.
 *
 * @param query - The DatacoreTS query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param dcApi - The DatacoreApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryExecuteTs(
	query: string,
	file: PublishFile,
	dcApi: DatacoreApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		dcApi.executeTs(query, div, component, file.getPath());
	} catch (error) {
		Logger.error(error);

		new Notice(`DatacoreTS execution error: ${error}, trying TSX...`);

		return tryExecuteTsx(query, file, dcApi);
	}

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

/**
 * Attempts to execute a DatacoreTSX query and returns the result as an HTMLDivElement.
 * If the execution fails, it returns the div without any modifications.
 *
 * @param query - The DatacoreTSX query to execute.
 * @param file - The PublishFile object representing the file being compiled.
 * @param dcApi - The DatacoreApi instance to use for executing the query.
 * @returns A promise that resolves to an HTMLDivElement containing the result of the query execution.
 */
async function tryExecuteTsx(
	query: string,
	file: PublishFile,
	dcApi: DatacoreApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();

	try {
		dcApi.executeTsx(query, div, component, file.getPath());
	} catch (error) {
		Logger.error(error);

		new Notice(`DatacoreTSX execution error: ${error}`);

		return div;
	}

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

/**
 * Checks if the HTMLDivElement contains a Datacore card.
 * This is determined by checking if the class list contains "datacore-card".
 *
 * @param html - The HTMLDivElement to check.
 * @returns True if the HTMLDivElement contains a Datacore card, false otherwise.
 */
function flagInjects(html: HTMLDivElement) {
	const classList =
		html.classList.length === 0
			? html.children[0].classList
			: html.classList;

	if (classList.contains("datacore-card")) {
		return true;
	}

	return false;
}
