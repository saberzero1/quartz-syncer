import { Component, Notice, htmlToMarkdown } from "obsidian";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
	IntegrationCompileResult,
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
	getEffectiveDataviewSyntax,
	getDataviewApi,
	isDataviewSyntaxResolved,
} from "src/compiler/integrations/apis/dataview";

function tryDVEvaluate(
	query: string,
	filePath: string,
	dvApi: DataviewApi,
): IntegrationCompileResult {
	try {
		const dataviewResult = dvApi.tryEvaluate(query.trim(), {
			this: dvApi.page(filePath) ?? {},
		});
		return {
			text: dataviewResult?.toString() ?? "",
			successful: true,
		};
	} catch (e) {
		console.debug("dvapi.tryEvaluate did not yield any result", e);
		return { text: "", successful: false };
	}
}

async function tryExecuteJs(
	query: string,
	filePath: string,
	dvApi: DataviewApi,
): Promise<string> {
	const div = createDiv();
	const component = new Component();
	component.load();
	await dvApi.executeJs(query, div, component, filePath);

	try {
		await renderPromise(div, "[data-tag-name]");
	} catch {
		// Timeout is non-fatal: the view may render without observable
		// DOM mutations (e.g. dv.view loading external JS files).
		// Proceed with whatever HTML exists in the container.
	}

	const markdown = htmlToMarkdown(div) || "";

	return cleanQueryResult(markdown);
}

export const DataviewIntegration: PluginIntegration = {
	id: "dataview",
	name: "Dataview",
	settingKey: "useDataview",
	isVaultDependent: true,
	priority: 100,
	category: "community",

	assets: {},

	isAvailable(): boolean {
		return !!getDataviewApi();
	},

	getPatterns(): PatternDescriptor[] {
		if (isDataviewSyntaxResolved() === false) {
			// Dataview is installed but has not loaded its persisted settings yet.
			// Any non-empty note could contain user-configured syntax, so detection
			// must stay conservative until those settings resolve.
			return [
				{
					id: "dv-unresolved",
					pattern: /[\s\S]/m,
					type: "block",
				},
			];
		}

		const {
			dataviewJsKeyword: jsKeyword,
			inlineQueryPrefix: inlinePrefix,
			inlineJsQueryPrefix: inlineJsPrefix,
		} = getEffectiveDataviewSyntax();

		return [
			{
				id: "dv-block",
				pattern: /(?:```|~~~)dataview\s(.+?)(?:```|~~~)/gms,
				type: "block",
			},
			{
				id: "dv-js-block",
				pattern: new RegExp(
					"(?:```|~~~)" +
						escapeRegExp(jsKeyword) +
						"\\s(.+?)(?:```|~~~)",
					"gms",
				),
				type: "block",
			},
			{
				id: "dv-inline",
				pattern: new RegExp(
					"`" +
						escapeRegExp(inlinePrefix) +
						"(?![=>])([^`\\r\\n]+?)`",
					"gm",
				),
				type: "inline",
			},
			{
				id: "dv-inline-js",
				pattern: new RegExp(
					"`" + escapeRegExp(inlineJsPrefix) + "([^`\\r\\n]+?)`",
					"gm",
				),
				type: "inline",
			},
		];
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<IntegrationCompileResult> {
		const dvApi = getDataviewApi();

		if (!dvApi) return { text: match.fullMatch, successful: false };

		const filePath = context.file.getPath();
		const query = match.captures[0] ?? "";
		if (!query) return { text: match.fullMatch, successful: false };
		const { isInsideCalloutDepth, finalQuery } = sanitizeQuery(query);

		try {
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

					return { text: markdown, successful: true };
				}

				case "dv-js-block": {
					return {
						text:
							(await tryExecuteJs(finalQuery, filePath, dvApi)) ??
							"",
						successful: true,
					};
				}

				case "dv-inline": {
					return tryDVEvaluate(query.trim(), filePath, dvApi);
				}

				case "dv-inline-js": {
					const evaluated = tryDVEvaluate(query, filePath, dvApi);

					if (!evaluated.successful || !evaluated.text) {
						return {
							text: await tryExecuteJs(query, filePath, dvApi),
							successful: true,
						};
					}

					return evaluated;
				}

				default:
					return { text: match.fullMatch, successful: false };
			}
		} catch (e) {
			console.debug(e);

			new Notice(
				"Quartz Syncer: Unable to render Dataview query. Please update the Dataview plugin to the latest version.",
			);

			return { text: match.fullMatch, successful: false };
		}
	},
};
