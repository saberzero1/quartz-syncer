import { DatacoreApi } from "@blacksmithgu/datacore/build/library/index";
import { Component, Notice } from "obsidian";
import Logger from "js-logger";
import {
	PluginIntegration,
	PatternDescriptor,
	PatternMatch,
	CompileContext,
	QuartzAssets,
} from "./types";
import {
	isPluginEnabled,
	renderPromise,
	sanitizeHTMLToString,
	surroundWithCalloutBlock,
	sanitizeQuery,
} from "src/utils/utils";
import { DATACORE_PLUGIN_ID } from "src/ui/suggest/constants";

const datacoreCardScss = `
.datacore-card {
  display: flex;
  flex-direction: column;
  padding: 1.2rem;
  border-radius: 0.5em;
  background-color: var(--background-secondary, rgba(0, 0, 0, 0));
  min-width: 89%;
  border: 2px solid var(--table-border-color, var(--gray));
  overflow-y: auto;

  .datacore-card-title {
    margin-bottom: 0.6em;
    display: flex;
    justify-content: space-between;
    font-size: 1.8em;

    &.centered {
      justify-content: center !important;
    }
  }

  .datacore-card-content,
  .datacore-card-inner,
  & {
    transition: all 0.3s cubic-bezier(0.65, 0.05, 0.36, 1);
  }

  .datacore-card-inner {
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 500px;
    display: flex;
  }

  .datacore-card-collapser,
  &.is-collapsed .datacore-card-collapser {
    transition: all 0.5s cubic-bezier(0.65, 0.05, 0.36, 1);
  }

  .datacore-card-content {
    flex-grow: 1;
  }

  &:not(&.is-collapsed) .datacore-card-collapser {
    transform: rotate(180deg);
  }

  &.is-collapsed .datacore-card-collapser {
    transform: rotate(0deg) !important;
  }

  .datacore-card-collapse,
  .datacore-card-collapser svg {
    min-width: 1em;
    min-height: 1em;
    fill: currentColor;
    vertical-align: middle;
  }

  .datacore-card-footer {
    font-size: 0.7em;
    text-align: right;
    padding: 0;
  }
}
`;

function getDatacoreApi(): DatacoreApi | undefined {
	if (isPluginEnabled(DATACORE_PLUGIN_ID)) {
		// @ts-expect-error Datacore exposes API on window when enabled
		return window.datacore as DatacoreApi;
	}

	return undefined;
}

async function tryExecuteJs(
	query: string,
	filePath: string,
	dcApi: DatacoreApi,
): Promise<HTMLDivElement> {
	const div = createEl("div");
	const component = new Component();

	try {
		dcApi.executeJs(query, div, component, filePath);
	} catch (error) {
		Logger.error(error);

		new Notice(
			`Quartz Syncer: DatacoreJS execution error: ${error}, trying JSX...`,
		);

		return tryExecuteJsx(query, filePath, dcApi);
	}

	component.load();

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

async function tryExecuteJsx(
	query: string,
	filePath: string,
	dcApi: DatacoreApi,
): Promise<HTMLDivElement> {
	const div = createEl("div");
	const component = new Component();

	try {
		dcApi.executeJsx(query, div, component, filePath);
	} catch (error) {
		Logger.error(error);
		new Notice(`Quartz Syncer: DatacoreJSX execution error: ${error}`);

		return div;
	}

	component.load();

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

async function tryExecuteTs(
	query: string,
	filePath: string,
	dcApi: DatacoreApi,
): Promise<HTMLDivElement> {
	const div = createEl("div");
	const component = new Component();

	try {
		dcApi.executeTs(query, div, component, filePath);
	} catch (error) {
		Logger.error(error);

		new Notice(
			`Quartz Syncer: DatacoreTS execution error: ${error}, trying TSX...`,
		);

		return tryExecuteTsx(query, filePath, dcApi);
	}

	component.load();

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

async function tryExecuteTsx(
	query: string,
	filePath: string,
	dcApi: DatacoreApi,
): Promise<HTMLDivElement> {
	const div = createEl("div");
	const component = new Component();

	try {
		dcApi.executeTsx(query, div, component, filePath);
	} catch (error) {
		Logger.error(error);
		new Notice(`Quartz Syncer: DatacoreTSX execution error: ${error}`);

		return div;
	}

	component.load();

	await renderPromise(
		div,
		'[class*=datacore], [__self="[Object object]"], [__source="[Object object]"]',
	);

	return div;
}

export const DatacoreIntegration: PluginIntegration = {
	id: "datacore",
	name: "Datacore",
	settingKey: "useDatacore",
	priority: 100,

	assets: {
		scss: datacoreCardScss,
	} as QuartzAssets,

	isAvailable(): boolean {
		return !!getDatacoreApi();
	},

	getPatterns(): PatternDescriptor[] {
		return [
			{
				id: "dc-js",
				pattern: /```datacorejs\s(.+?)```/gms,
				type: "block",
			},
			{
				id: "dc-jsx",
				pattern: /```datacorejsx\s(.+?)```/gms,
				type: "block",
			},
			{
				id: "dc-ts",
				pattern: /```datacorets\s(.+?)```/gms,
				type: "block",
			},
			{
				id: "dc-tsx",
				pattern: /```datacoretsx\s(.+?)```/gms,
				type: "block",
			},
		];
	},

	async compile(
		match: PatternMatch,
		context: CompileContext,
	): Promise<string> {
		const dcApi = getDatacoreApi();

		if (!dcApi) return match.fullMatch;

		const filePath = context.file.getPath();
		const query = match.captures[0];
		const { isInsideCalloutDepth, finalQuery } = sanitizeQuery(query);
		const serializer = new XMLSerializer();

		try {
			let queryResult: HTMLDivElement;

			switch (match.descriptor.id) {
				case "dc-js":
					queryResult = await tryExecuteJs(
						finalQuery,
						filePath,
						dcApi,
					);
					break;
				case "dc-jsx":
					queryResult = await tryExecuteJsx(
						finalQuery,
						filePath,
						dcApi,
					);
					break;
				case "dc-ts":
					queryResult = await tryExecuteTs(
						finalQuery,
						filePath,
						dcApi,
					);
					break;
				case "dc-tsx":
					queryResult = await tryExecuteTsx(
						finalQuery,
						filePath,
						dcApi,
					);
					break;
				default:
					return match.fullMatch;
			}

			const result = sanitizeHTMLToString(queryResult, serializer);

			if (isInsideCalloutDepth > 0) {
				return surroundWithCalloutBlock(result, isInsideCalloutDepth);
			}

			return result;
		} catch (error) {
			Logger.error(error);
			new Notice(`Quartz Syncer: Datacore query error: ${error}`);

			return match.fullMatch;
		}
	},
};
