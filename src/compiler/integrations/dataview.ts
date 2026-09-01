import { Component, Notice, htmlToMarkdown } from "obsidian";
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
	sanitizeHTMLToString,
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
		console.debug("dvapi.tryEvaluate did not yield any result", e);
	}

	return result;
}

async function tryExecuteJs(
	query: string,
	filePath: string,
	dvApi: DataviewApi,
	styles?: string[],
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

	// Folder-based views (dv.view()) can populate a callout's body via a
	// nested dv.view() call that resolves shortly after the outer render
	// settles. Give empty callouts a short grace period before snapshotting.
	await waitForCalloutContent(div);

	// Callouts collapsed by default (data-callout-fold="-") freeze Obsidian's
	// own collapse-animation bookkeeping (`display: none`, `grid-template-rows:
	// 0fr`) onto `.callout-content` while collapsed. Quartz's fold script only
	// toggles the `is-collapsed` class on click, so a callout captured in its
	// collapsed state would stay visually stuck even after expanding. Force
	// every callout open before capturing; convertCallouts() restores the
	// intended default-collapsed state from `data-callout-fold` afterwards.
	expandCollapsedCallouts(div);

	// dv.view() injects a <style> element for folder-based views
	// (view.js + view.css); htmlToMarkdown drops <style>, so pull its
	// contents out first and hand it to the caller to publish separately.
	for (const styleEl of Array.from(div.querySelectorAll("style"))) {
		if (styleEl.textContent) styles?.push(styleEl.textContent);
		styleEl.remove();
	}

	// htmlToMarkdown doesn't know about Obsidian's .callout DOM (it only
	// understands standard <blockquote>), nor about arbitrary <div> wrappers
	// (e.g. dv.el("div", ...) grid/layout containers) - it silently flattens
	// both, discarding their classes/styles/structure. Replace them with
	// their raw HTML before conversion, the same approach used for Datacore
	// query results.
	replacePreservedElementsWithRawHtml(div);

	const markdown = htmlToMarkdown(div) || "";

	return cleanQueryResult(markdown);
}

/**
 * Removes Obsidian's live collapsed-state markers (`.is-collapsed` class and
 * the frozen inline `display`/`grid-template-rows` styles it leaves on
 * `.callout-content`) so every callout is captured fully expanded. Obsidian's
 * rendered DOM always sets `data-callout-fold=""` regardless of the original
 * `[!type]-` fold marker, so the desired default-collapsed state is encoded
 * back into that attribute (as "-") before the `.is-collapsed` class is
 * stripped, letting convertCallouts() restore it in the final markup.
 */
function expandCollapsedCallouts(div: HTMLDivElement): void {
	for (const callout of Array.from(div.querySelectorAll(".callout"))) {
		if (callout.classList.contains("is-collapsed")) {
			callout.setAttribute("data-callout-fold", "-");
		}
		callout.classList.remove("is-collapsed");
		callout.querySelector(".callout-fold")?.classList.remove("is-collapsed");
		callout.querySelector(".callout-content")?.removeAttribute("style");
	}
}

/**
 * Waits for any `.callout-content` elements that are still empty to be
 * populated, up to a bounded grace period. Folder-based dv.view() callouts
 * (e.g. a custom "callout" view) may fill their body asynchronously after
 * the outer render's mutation-quiet window has already elapsed.
 */
function waitForCalloutContent(
	div: HTMLDivElement,
	timeout = 2000,
	interval = 200,
): Promise<void> {
	const hasEmptyCalloutContent = () =>
		Array.from(div.querySelectorAll(".callout-content")).some(
			(el) => el.childNodes.length === 0,
		);

	return new Promise((resolve) => {
		if (!hasEmptyCalloutContent()) {
			resolve();

			return;
		}

		const start = Date.now();

		const poll = () => {
			if (!hasEmptyCalloutContent() || Date.now() - start >= timeout) {
				resolve();

				return;
			}
			window.setTimeout(poll, interval);
		};

		window.setTimeout(poll, interval);
	});
}

/**
 * Dataview's own built-in renders (dv.table(), dv.list(), etc.) wrap their
 * output in elements classed with "dataview" - these already have a clean
 * markdown conversion and shouldn't be forced into raw HTML.
 */
function isBuiltinDataviewElement(el: Element): boolean {
	return el.classList.contains("dataview");
}

/**
 * Serializes each top-level `.callout` or non-Dataview `<div>` wrapper (e.g.
 * custom dv.el()/dv.view() layout containers) into raw HTML and swaps it in
 * as a plain text node, so htmlToMarkdown passes it through untouched
 * instead of flattening it and discarding its classes/styles/structure.
 */
function replacePreservedElementsWithRawHtml(div: HTMLDivElement): void {
	const serializer = new XMLSerializer();

	const isPreservable = (el: Element): boolean => {
		if (el.classList.contains("callout")) return true;

		return (
			el.tagName === "DIV" &&
			!isBuiltinDataviewElement(el) &&
			(el.hasAttribute("class") || el.hasAttribute("style"))
		);
	};

	const candidates = Array.from(div.querySelectorAll("*")).filter(
		isPreservable,
	);

	// Only keep top-level candidates: nested ones are already captured via
	// cloneNode(true) when their closest preserved ancestor is serialized.
	const topLevel = candidates.filter(
		(el) => !candidates.some((other) => other !== el && other.contains(el)),
	);

	for (const el of topLevel) {
		const wrapper = createDiv();
		wrapper.appendChild(el.cloneNode(true));
		const html = sanitizeHTMLToString(wrapper, serializer);
		el.replaceWith(document.createTextNode(`\n\n${html}\n\n`));
	}
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
						"`" + escapeRegExp(inlinePrefix) + "(?!=)(.+?)`",
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
		const query = match.captures[0] ?? "";
		if (!query) return match.fullMatch;
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
						(await tryExecuteJs(
							finalQuery,
							filePath,
							dvApi,
							context.styles,
						)) ?? ""
					);
				}

				case "dv-inline": {
					result = tryDVEvaluate(query.trim(), filePath, dvApi);

					return result?.toString() ?? "";
				}

				case "dv-inline-js": {
					result = tryDVEvaluate(query, filePath, dvApi);

					if (!result) {
						result = await tryExecuteJs(
							query,
							filePath,
							dvApi,
							context.styles,
						);
					}

					return result ?? "Unable to render query";
				}

				default:
					return match.fullMatch;
			}
		} catch (e) {
			console.debug(e);

			new Notice(
				"Quartz Syncer: Unable to render Dataview query. Please update the Dataview plugin to the latest version.",
			);

			return match.fullMatch;
		}
	},
};
