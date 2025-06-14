import { Component, Notice, htmlToMarkdown } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { cleanQueryResult, delay, escapeRegExp } from "src/utils/utils";
import { DataviewApi, getAPI } from "obsidian-dataview";
import { PublishFile } from "src/publishFile/PublishFile";
import Logger from "js-logger";

export class DataviewCompiler {
	constructor() {}

	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;
		const dataViewRegex = /```dataview\s(.+?)```/gms;
		const dvApi = getAPI();

		if (!dvApi) return replacedText;
		const matches = text.matchAll(dataViewRegex);

		const dataviewJsPrefix = dvApi.settings.dataviewJsKeyword;

		const dataViewJsRegex = new RegExp(
			"```" + escapeRegExp(dataviewJsPrefix) + "\\s(.+?)```",
			"gsm",
		);
		const dataviewJsMatches = text.matchAll(dataViewJsRegex);

		const inlineQueryPrefix = dvApi.settings.inlineQueryPrefix;

		const inlineDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineQueryPrefix) + "(.+?)`",
			"gsm",
		);
		const inlineMatches = text.matchAll(inlineDataViewRegex);

		const inlineJsQueryPrefix = dvApi.settings.inlineJsQueryPrefix;

		const inlineJsDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineJsQueryPrefix) + "(.+?)`",
			"gsm",
		);
		const inlineJsMatches = text.matchAll(inlineJsDataViewRegex);

		if (
			!matches &&
			!inlineMatches &&
			!dataviewJsMatches &&
			!inlineJsMatches
		) {
			return text;
		}

		//Code block queries
		for (const queryBlock of matches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCalloutDepth, finalQuery } =
					this.sanitizeQuery(query);

				let markdown = await dvApi.tryQueryMarkdown(
					finalQuery,
					file.getPath(),
				);

				if (isInsideCalloutDepth > 0) {
					markdown = this.surroundWithCalloutBlock(
						markdown,
						isInsideCalloutDepth,
					);
				}

				replacedText = replacedText.replace(block, `${markdown}`);
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render dataview query. Please update the dataview plugin to the latest version.",
				);

				return queryBlock[0];
			}
		}

		for (const queryBlock of dataviewJsMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const dataviewResult = await tryExecuteJs(query, file, dvApi);

				if (dataviewResult) {
					replacedText = replacedText.replace(
						block,
						dataviewResult.toString() ?? "",
					);
				}
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render dataviewjs query. Please update the dataview plugin to the latest version.",
				);

				return queryBlock[0];
			}
		}

		//Inline queries
		for (const inlineQuery of inlineMatches) {
			try {
				const code = inlineQuery[0];
				const query = inlineQuery[1];

				const dataviewResult = tryDVEvaluate(query.trim(), file, dvApi);

				if (dataviewResult) {
					replacedText = replacedText.replace(
						code,
						dataviewResult.toString() ?? "",
					);
				}
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render inline dataview query. Please update the dataview plugin to the latest version.",
				);

				return inlineQuery[0];
			}
		}

		for (const inlineJsQuery of inlineJsMatches) {
			try {
				const code = inlineJsQuery[0];
				const query = inlineJsQuery[1];

				let result: string | undefined | null = "";

				result = tryDVEvaluate(query, file, dvApi);

				if (!result) {
					result = tryEval(query);
				}

				if (!result) {
					result = await tryExecuteJs(query, file, dvApi);
				}

				replacedText = replacedText.replace(
					code,
					result ?? "Unable to render query",
				);
			} catch (e) {
				Logger.error(e);

				new Notice(
					"Unable to render inline dataviewjs query. Please update the dataview plugin to the latest version.",
				);

				return inlineJsQuery[0];
			}
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

function tryDVEvaluate(
	query: string,
	file: PublishFile,
	dvApi: DataviewApi,
): string | undefined | null {
	let result = "";

	try {
		const dataviewResult = dvApi.tryEvaluate(query.trim(), {
			this: dvApi.page(file.getPath()) ?? {},
		});
		result = dataviewResult?.toString() ?? "";
	} catch (e) {
		Logger.warn("dvapi.tryEvaluate did not yield any result", e);
	}

	return result;
}

function tryEval(query: string) {
	let result = "";

	try {
		result = (0, eval)("const dv = DataviewAPI;" + query); //https://esbuild.github.io/content-types/#direct-eval
	} catch (e) {
		Logger.warn("eval did not yield any result", e);
	}

	return result;
}

async function tryExecuteJs(
	query: string,
	file: PublishFile,
	dvApi: DataviewApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();
	await dvApi.executeJs(query, div, component, file.getPath());
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 100) {
		await delay(5);
		counter++;
	}

	const markdown = htmlToMarkdown(div) || "";

	const result = cleanQueryResult(markdown);

	return result;
}
