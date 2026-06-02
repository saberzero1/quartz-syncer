import { DATAVIEW_PLUGIN_ID } from "src/ui/suggest/constants";

interface DataviewSettings {
	dataviewJsKeyword?: string;
	inlineQueryPrefix?: string;
	inlineJsQueryPrefix?: string;
}

interface DataviewApi {
	settings: DataviewSettings;
	page(path: string): unknown;
	tryEvaluate(
		query: string,
		context: {
			this: unknown;
		},
	): unknown;
	executeJs(
		query: string,
		el: HTMLElement,
		component: unknown,
		filePath: string,
	): Promise<void>;
	tryQueryMarkdown(query: string, filePath: string): Promise<string>;
}

function getDataviewApi(): DataviewApi | undefined {
	/* eslint-disable no-restricted-globals, no-undef, @typescript-eslint/no-unsafe-member-access -- global app is required for Obsidian plugin API access */
	//@ts-expect-error global app is available in Obsidian
	const plugin = app.plugins.plugins[DATAVIEW_PLUGIN_ID] as
		| { api?: DataviewApi }
		| undefined;
	/* eslint-enable no-restricted-globals, no-undef, @typescript-eslint/no-unsafe-member-access -- end global app plugin access */

	return plugin?.api;
}

export { getDataviewApi };
export type { DataviewApi };
