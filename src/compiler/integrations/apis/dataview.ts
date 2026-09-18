const DATAVIEW_PLUGIN_ID = "dataview";

/** Match the existing startup guard: long enough for normal plugin loading, never unbounded. */
export const DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS = 30_000;
const DATAVIEW_SYNTAX_INITIAL_POLL_MS = 25;
const DATAVIEW_SYNTAX_MAX_POLL_MS = 1_000;

export interface DataviewSettings {
	dataviewJsKeyword?: string;
	inlineQueryPrefix?: string;
	inlineJsQueryPrefix?: string;
}

export interface EffectiveDataviewSyntax {
	dataviewJsKeyword: string;
	inlineQueryPrefix: string;
	inlineJsQueryPrefix: string;
}

export const DEFAULT_DATAVIEW_SYNTAX: EffectiveDataviewSyntax = {
	dataviewJsKeyword: "dataviewjs",
	inlineQueryPrefix: "=",
	inlineJsQueryPrefix: "$=",
};

interface DataviewIndex {
	initialized?: boolean;
	revision?: number;
}

interface DataviewApi {
	settings: DataviewSettings;
	index?: DataviewIndex;
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

type DataviewPlugin = {
	api?: DataviewApi;
	settings?: DataviewSettings;
};

export type DataviewSyntaxResolution = "resolved" | "unresolved";

const syntaxResolutionBarriers = new WeakMap<
	DataviewPlugin,
	Promise<DataviewSyntaxResolution>
>();
const syntaxResolutionVerdicts = new WeakMap<DataviewPlugin, "resolved">();
const syntaxResolutionTimedOut = new WeakSet<DataviewPlugin>();

function getDataviewPlugin(): DataviewPlugin | undefined {
	const globalApp = (
		window as {
			app?: {
				plugins?: { plugins?: Record<string, DataviewPlugin> };
			};
		}
	).app;

	return globalApp?.plugins?.plugins?.[DATAVIEW_PLUGIN_ID];
}

function syntaxFromSettings(
	settings: DataviewSettings | undefined,
): EffectiveDataviewSyntax {
	return {
		dataviewJsKeyword:
			settings?.dataviewJsKeyword ||
			DEFAULT_DATAVIEW_SYNTAX.dataviewJsKeyword,
		inlineQueryPrefix:
			settings?.inlineQueryPrefix ||
			DEFAULT_DATAVIEW_SYNTAX.inlineQueryPrefix,
		inlineJsQueryPrefix:
			settings?.inlineJsQueryPrefix ||
			DEFAULT_DATAVIEW_SYNTAX.inlineJsQueryPrefix,
	};
}

function getDataviewApi(): DataviewApi | undefined {
	return getDataviewPlugin()?.api;
}

function getEffectiveDataviewSyntax(): EffectiveDataviewSyntax {
	const plugin = getDataviewPlugin();
	// The plugin instance owns persisted settings before its public API is ready.
	// Prefer them so cache identity does not change during plugin startup.
	const settings = plugin?.settings ?? plugin?.api?.settings;

	return syntaxFromSettings(settings);
}

function isDataviewSyntaxResolved(
	plugin: DataviewPlugin | undefined = getDataviewPlugin(),
): boolean {
	return !plugin || plugin.settings !== undefined || plugin.api !== undefined;
}

function getDataviewSyntaxFingerprint(): EffectiveDataviewSyntax {
	const plugin = getDataviewPlugin();
	if (!plugin) return DEFAULT_DATAVIEW_SYNTAX;

	const settings = plugin.settings ?? plugin.api?.settings;
	if (!settings) {
		throw new Error(
			"Dataview syntax fingerprint requested before settings resolved.",
		);
	}

	return syntaxFromSettings(settings);
}

function waitForDataviewSyntaxResolution():
	| DataviewSyntaxResolution
	| Promise<DataviewSyntaxResolution> {
	const plugin = getDataviewPlugin();
	if (!plugin) return "resolved";

	const verdict = syntaxResolutionVerdicts.get(plugin);
	if (verdict) return verdict;

	if (isDataviewSyntaxResolved(plugin)) {
		syntaxResolutionVerdicts.set(plugin, "resolved");
		return "resolved";
	}
	if (syntaxResolutionTimedOut.has(plugin)) return "unresolved";

	const existingBarrier = syntaxResolutionBarriers.get(plugin);
	if (existingBarrier) return existingBarrier;

	const startedAt = performance.now();
	let resolveBarrier: (result: DataviewSyntaxResolution) => void = () =>
		undefined;
	const barrier = new Promise<DataviewSyntaxResolution>((resolve) => {
		resolveBarrier = resolve;
	});
	syntaxResolutionBarriers.set(plugin, barrier);
	let timer: number | null = null;
	let delay = DATAVIEW_SYNTAX_INITIAL_POLL_MS;

	const finish = (
		result: DataviewSyntaxResolution,
		timedOut = false,
	): void => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}
		syntaxResolutionBarriers.delete(plugin);
		if (result === "resolved") syntaxResolutionVerdicts.set(plugin, result);
		if (timedOut) syntaxResolutionTimedOut.add(plugin);
		resolveBarrier(result);
	};

	const check = (): void => {
		if (getDataviewPlugin() !== plugin) {
			finish("unresolved");
			return;
		}
		if (isDataviewSyntaxResolved(plugin)) {
			finish("resolved");
			return;
		}

		const elapsed = performance.now() - startedAt;
		if (elapsed >= DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS) {
			finish("unresolved", true);
			return;
		}

		const remaining = DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS - elapsed;
		timer = window.setTimeout(
			() => {
				timer = null;
				check();
			},
			Math.min(delay, remaining),
		);
		delay = Math.min(delay * 2, DATAVIEW_SYNTAX_MAX_POLL_MS);
	};

	check();
	return barrier;
}

export {
	getDataviewApi,
	getDataviewSyntaxFingerprint,
	getEffectiveDataviewSyntax,
	isDataviewSyntaxResolved,
	waitForDataviewSyntaxResolution,
};
export type { DataviewApi };
