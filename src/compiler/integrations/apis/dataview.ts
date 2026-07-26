const DATAVIEW_PLUGIN_ID = "dataview";

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
	const globalApp = (globalThis as {
		app?: { plugins?: { plugins?: Record<string, { api?: DataviewApi }> } };
	}).app;
	const plugin = globalApp?.plugins?.plugins?.[DATAVIEW_PLUGIN_ID];

	return plugin?.api;
}

export { getDataviewApi };
export type { DataviewApi };
