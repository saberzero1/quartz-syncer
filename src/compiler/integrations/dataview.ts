import { Component, Notice, htmlToMarkdown } from "obsidian";
import Logger from "js-logger";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
} from "./types";
import {
	escapeRegExp,
	cleanQueryResult,
	renderPromise,
	surroundWithCalloutBlock,
	sanitizeQuery,
} from "src/utils/utils";
import {
	type DataviewApi,
	getDataviewApi,
} from "src/compiler/integrations/apis/dataview";

function tryDVEvaluate(
	query: string,
	filePath: string,
	dvApi: DataviewApi,
): string | undefined | null {
	let result = "";

	try {
		const dataviewResult = dvApi.tryEvaluate(query.trim(), {
			this: dvApi.page(filePath) ?? {},
		});
		result = dataviewResult?.toString() ?? "";
	} catch (e) {
		Logger.warn("dvapi.tryEvaluate did not yield any result", e);
	}

	return result;
}

async function tryExecuteJs(
	query: string,
	filePath: string,
	dvApi: DataviewApi,
) {
	const div = activeDocument.createElement("div");
	const component = new Component();
	component.load();
	await dvApi.executeJs(query, div, component, filePath);

	await renderPromise(div, "[data-tag-name]");

	const markdown = htmlToMarkdown(div) || "";

	return cleanQueryResult(markdown);
}

export const DataviewIntegration: PluginIntegration = {
	id: "dataview",
	name: "Dataview",
	settingKey: "useDataview",
	priority: 100,
	category: "community",

	assets: {},

	isAvailable(): boolean {
		return !!getDataviewApi();
	},

	getPatterns(): PatternDescriptor[] {
		const dvApi = getDataviewApi();

		const patterns: PatternDescriptor[] = [
			{
				id: "dv-block",
				pattern: /```dataview\s(.+?)```/gms,
				type: "block",
			},
		];

		if (dvApi) {
			const jsKeyword = dvApi.settings.dataviewJsKeyword || "dataviewjs";
			const inlinePrefix = dvApi.settings.inlineQueryPrefix || "=";
			const inlineJsPrefix = dvApi.settings.inlineJsQueryPrefix || "$=";

			patterns.push(
				{
					id: "dv-js-block",
					pattern: new RegExp(
						"```" + escapeRegExp(jsKeyword) + "\\s(.+?)```",
						"gms",
					),
					type: "block",
				},
				{
					id: "dv-inline",
					pattern: new RegExp(
						"`" + escapeRegExp(inlinePrefix) + "(.+?)`",
						"gms",
					),
					type: "inline",
				},
				{
					id: "dv-inline-js",
					pattern: new RegExp(
						"`" + escapeRegExp(inlineJsPrefix) + "(.+?)`",
						"gms",
					),
					type: "inline",
				},
			);
		}

		return patterns;
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const dvApi = getDataviewApi();

		if (!dvApi) return match.fullMatch;

		const filePath = context.file.getPath();
		const query = match.captures[0];
		const { isInsideCalloutDepth, finalQuery } = sanitizeQuery(query);

		try {
			let result: string | undefined | null = "";

			switch (match.descriptor.id) {
				case "dv-block": {
					let markdown = await dvApi.tryQueryMarkdown(
						finalQuery,
						filePath,
					);

					if (isInsideCalloutDepth > 0) {
						markdown = surroundWithCalloutBlock(
							markdown,
							isInsideCalloutDepth,
						);
					}

					return markdown;
				}

				case "dv-js-block": {
					return (
						(await tryExecuteJs(finalQuery, filePath, dvApi)) ?? ""
					);
				}

				case "dv-inline": {
					result = tryDVEvaluate(query.trim(), filePath, dvApi);

					return result?.toString() ?? "";
				}

				case "dv-inline-js": {
					result = tryDVEvaluate(query, filePath, dvApi);

					if (!result) {
						result = await tryExecuteJs(query, filePath, dvApi);
					}

					return result ?? "Unable to render query";
				}

				default:
					return match.fullMatch;
			}
		} catch (e) {
			Logger.error(e);

			new Notice(
				"Quartz Syncer: Unable to render dataview query. Please update the dataview plugin to the latest version.",
			);

			return match.fullMatch;
		}
	},
};
