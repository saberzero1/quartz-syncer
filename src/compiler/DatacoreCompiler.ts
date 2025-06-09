import { DatacoreApi } from "@blacksmithgu/datacore/build/library/index";
import { App, Component, Notice } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { isPluginEnabled } from "src/utils/utils";
import Logger from "js-logger";

export class DatacoreCompiler {
	app: App;
	datacore: DatacoreApi | undefined;

	constructor(app: App) {
		this.app = app;
		this.datacore = getDatacoreApi();
	}

	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;

		if (!this.datacore) return text;

		let injectCardStyle = false;
		const cardClass = "datacore-card";

		const dcApi = this.datacore;

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

				const result = (await tryExecuteJs(finalQuery, file, dcApi))
					.innerHTML;

				if (result.includes(cardClass)) injectCardStyle = true;

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

				const result = (await tryExecuteJsx(finalQuery, file, dcApi))
					.innerHTML;

				if (result.includes(cardClass)) injectCardStyle = true;

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

				const result = (await tryExecuteTs(finalQuery, file, dcApi))
					.innerHTML;

				if (result.includes(cardClass)) injectCardStyle = true;

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

				const result = (await tryExecuteTsx(finalQuery, file, dcApi))
					.innerHTML;

				if (result.includes(cardClass)) injectCardStyle = true;

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

		if (injectCardStyle) {
			replacedText = replacedText + addCardStyle(); // Add the card style at the end of the text
		}

		return replacedText;
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

//delay async function
function delay(milliseconds: number) {
	return new Promise((resolve, _) => {
		setTimeout(resolve, milliseconds);
	});
}

function addCardStyle() {
	return `
<style>
.datacore-card {
    display: flex;
    flex-direction: column;
    padding: 1.2rem;
    border-radius: 0.5em;
    background-color: var(--background-secondary);
    min-width: 89%;
    border: 2px solid var(--table-border-color);
    overflow-y: scroll;
}

.datacore-card-title {
    margin-bottom: 0.6em;
    display: flex;
    justify-content: space-between;
    font-size: 1.8em;
}

.datacore-card-title.centered {
    justify-content: center !important;
}

.datacore-card-content,
.datacore-card-inner,
.datacore-card {
    transition: all 0.3s cubic-bezier(0.65, 0.05, 0.36, 1);
}
.datacore-card-inner {
    overflow-y: scroll;
    overflow-x: hidden;
    max-height: 500px;
}

.datacore-card .datacore-card-collapser,
.datacore-card.is-collapsed .datacore-card-collapser {
    transition: all 0.5s cubic-bezier(0.65, 0.05, 0.36, 1);
}

.datacore-card-content {
    flex-grow: 1;
}

.datacore-card-inner {
    display: flex;
}

.datacore-card:not(.datacore-card.is-collapsed) .datacore-card-collapser {
    transform: rotate(180deg);
}

.datacore-card.is-collapsed .datacore-card-collapser {
    transform: rotate(0deg) !important;
}

.datacore-card-collapse,
.datacore-card-collapser svg {
    min-width: 1em;
    min-height: 1em;
    fill: currentColor;
    vertical-align: middle;
}

.datacore-card.is-collapsed .datacore-card-collapser {
    transform: rotate(0deg);
}

.datacore-card .datacore-card-footer {
    font-size: 0.7em;
    text-align: right;
    padding: 0;
}
</style>
`;
}
