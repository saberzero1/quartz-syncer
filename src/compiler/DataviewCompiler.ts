import { Component, Notice, htmlToMarkdown } from "obsidian";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import {
	cleanQueryResult,
	renderPromise,
	escapeRegExp,
	surroundWithCalloutBlock,
	sanitizeQuery,
} from "src/utils/utils";
import { DataviewApi, getAPI } from "obsidian-dataview";
import { PublishFile } from "src/publishFile/PublishFile";
import Logger from "js-logger";

/**
 * DataviewCompiler class.
 * This class is responsible for compiling Dataview queries in the text.
 * It replaces the queries with the results of the queries.
 * It supports both code block queries and inline queries.
 * It also supports DataviewJS queries.
 *
 * Documentation: {@link https://saberzero1.github.io/quartz-syncer-docs/Settings/Integrations/Dataview}
 */
export class DataviewCompiler {
	constructor() {}

	/**
	 * Compiles the text by replacing Dataview queries with their results.
	 * It supports both code block queries and inline queries.
	 * It also supports DataviewJS queries.
	 *
	 * @param file - The file to compile the text for.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 * @throws If the Dataview API is not available, a notice is shown to the user.
	 */
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
					sanitizeQuery(query);

				let markdown = await dvApi.tryQueryMarkdown(
					finalQuery,
					file.getPath(),
				);

				if (isInsideCalloutDepth > 0) {
					markdown = surroundWithCalloutBlock(
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
}

/**
 * Tries to evaluate a Dataview query using the Dataview API.
 *
 * @param query - The Dataview query to evaluate.
 * @param file - The file to evaluate the query against.
 * @param dvApi - The Dataview API instance.
 * @returns The result of the evaluation as a string, or undefined if the evaluation failed.
 * @throws Will log a warning if the evaluation fails.
 */
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

/**
 * Tries to evaluate a DataviewJS query using the eval function.
 *
 * @param query - The DataviewJS query to evaluate.
 * @returns The result of the evaluation as a string, or an empty string if the evaluation failed.
 * @throws Will log a warning if the evaluation fails.
 */
function tryEval(query: string) {
	let result = "";

	try {
		result = (0, eval)("const dv = DataviewAPI;" + query); //https://esbuild.github.io/content-types/#direct-eval
	} catch (e) {
		Logger.warn("eval did not yield any result", e);
	}

	return result;
}

/**
 * Tries to execute a DataviewJS query using the Dataview API.
 *
 * @param query - The DataviewJS query to execute.
 * @param file - The file to execute the query against.
 * @param dvApi - The Dataview API instance.
 * @returns The result of the execution as a string, or an empty string if the execution failed.
 */
async function tryExecuteJs(
	query: string,
	file: PublishFile,
	dvApi: DataviewApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();
	await dvApi.executeJs(query, div, component, file.getPath());

	await renderPromise(div, "[data-tag-name]");

	const markdown = htmlToMarkdown(div) || "";

	const result = cleanQueryResult(markdown);

	return result;
}
