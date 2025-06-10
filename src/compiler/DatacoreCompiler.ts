import { DatacoreApi } from "@blacksmithgu/datacore/build/library/index";
import { App, Component, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { delay, isPluginEnabled, sanitizeHTMLToString } from "src/utils/utils";
import { datacoreCard } from "src/utils/styles";
import Logger from "js-logger";

export class DatacoreCompiler {
	app: App;
	datacore: DatacoreApi | undefined;
	serializer: XMLSerializer;

	constructor(app: App) {
		this.app = app;
		this.datacore = getDatacoreApi();
		this.serializer = new XMLSerializer();
	}

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
					this.sanitizeQuery(query);

				const queryResult = await tryExecuteJs(finalQuery, file, dcApi);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						this.surroundWithCalloutBlock(
							result,
							isInsideCalloutDepth,
						),
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
					this.sanitizeQuery(query);

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
						this.surroundWithCalloutBlock(
							result,
							isInsideCalloutDepth,
						),
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
					this.sanitizeQuery(query);

				const queryResult = await tryExecuteTs(finalQuery, file, dcApi);

				injectCardCSS = injectCardCSS || flagInjects(queryResult);

				const result = sanitizeHTMLToString(
					queryResult,
					this.serializer,
				);

				if (isInsideCalloutDepth > 0) {
					replacedText = replacedText.replace(
						block,
						this.surroundWithCalloutBlock(
							result,
							isInsideCalloutDepth,
						),
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
					this.sanitizeQuery(query);

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
						this.surroundWithCalloutBlock(
							result,
							isInsideCalloutDepth,
						),
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

	/**
	 * Splits input in lines.
	 * Prepends the callout/quote sign to each line,
	 * returns all the lines as a single string
	 *
	 */
	surroundWithCalloutBlock(input: string, depth: number = 1): string {
		const tmp = input.split("\n");

		const calloutSymbol = "> ".repeat(depth);

		return " " + tmp.join(`\n${calloutSymbol}`);
	}

	/**
	 * Checks if a query is inside a callout block.
	 * Removes the callout symbols and re-join sanitized parts.
	 * Also returns the boolean that indicates if the query was inside a callout.
	 * @param query
	 * @returns
	 */
	sanitizeQuery(query: string): {
		isInsideCalloutDepth: number;
		finalQuery: string;
	} {
		let isInsideCalloutDepth = 0;
		const parts = query.split("\n");
		const sanitized = [];

		for (const part of parts) {
			let depthPivot = 0;

			if (part.startsWith(">")) {
				depthPivot += 1;
				let intermediate = part.substring(1).trim();

				while (intermediate.startsWith(">")) {
					intermediate = intermediate.substring(1).trim();
					depthPivot += 1;
				}
				sanitized.push(intermediate);
			} else {
				sanitized.push(part);
			}
			isInsideCalloutDepth = Math.max(isInsideCalloutDepth, depthPivot);
		}
		let finalQuery = query;

		if (isInsideCalloutDepth > 0) {
			finalQuery = sanitized.join("\n");
		}

		return { isInsideCalloutDepth, finalQuery };
	}
}

// https://blacksmithgu.github.io/datacore/code-views
// This is the suggested way to access the Datacore API
// According to the documentation.
// This will hopefully change in the future when the API stabilizes.
function getDatacoreApi(): DatacoreApi | undefined {
	if (isPluginEnabled("datacore")) {
		//@ts-expect-error If datacore is enabled, it should be available on the window object
		return window.datacore as DatacoreApi;
	}

	return undefined;
}

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
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 100) {
		await delay(5);
		counter++;
	}

	return div;
}

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
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 100) {
		await delay(5);
		counter++;
	}

	return div;
}

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
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 100) {
		await delay(5);
		counter++;
	}

	return div;
}

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
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 100) {
		await delay(5);
		counter++;
	}

	return div;
}

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
