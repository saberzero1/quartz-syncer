import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { sanitizeHTMLToDom, htmlToMarkdown, Notice } from "obsidian";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";

/**
 * Generates a URL path from a file path.
 * If slugifyPath is true, it will slugify the path segments.
 * If slugifyPath is false, it will return the path as is without the file extension.
 *
 * @param filePath - The file path to generate the URL path from.
 * @param slugifyPath - Whether to slugify the path segments (default is true).
 * @returns The generated URL path.
 */
function generateUrlPath(filePath: string, slugifyPath = true): string {
	if (!filePath) {
		return filePath;
	}

	const extensionLessPath = filePath.contains(".")
		? filePath.substring(0, filePath.lastIndexOf("."))
		: filePath;

	if (!slugifyPath) {
		return extensionLessPath + "/";
	}

	return (
		extensionLessPath
			.split("/")
			.map((x) => slugify(x, { separator: "-", lowercase: false }))
			.join("/") + "/"
	);
}

/**
 * Generates a SHA1 hash for a blob content.
 * The content is prefixed with the header "blob \{byteLength\}\\0".
 *
 * @param content - The content of the blob to hash.
 * @returns The SHA1 hash of the blob content.
 */
function generateBlobHash(content: string) {
	const byteLength = new TextEncoder().encode(content).byteLength;
	const header = `blob ${byteLength}\0`;
	const gitBlob = header + content;

	return sha1(gitBlob).toString();
}

/**
 * Wraps a value around a given size.
 * This is useful for circular arrays or when you want to ensure the value stays within a certain range.
 *
 * @param value - The value to wrap around.
 * @param size - The size of the range to wrap around.
 * @returns The wrapped value.
 */
const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};

/**
 * Returns a rewrite rule for the given vault path.
 * The rule rewrites the vault path to the root path ("/").
 *
 * @param vaultPath - The path of the vault to rewrite.
 * @returns A PathRewriteRule object with the from and to properties.
 */
function getRewriteRules(vaultPath: string): PathRewriteRule {
	return { from: vaultPath, to: "/" };
}

/**
 * Returns the syncer path for a note based on the provided vault path and rewrite rules.
 * If the vault path starts with the 'from' part of the rules, it replaces it with the 'to' part.
 * If the resulting path starts with a "/", it removes it.
 *
 * @param vaultPath - The path of the vault to rewrite.
 * @param rules - The PathRewriteRule object containing 'from' and 'to' properties.
 * @returns The rewritten path for the note.
 */
function getSyncerPathForNote(
	vaultPath: string,
	rules: PathRewriteRule,
): string {
	const { from, to } = rules;

	if (vaultPath && vaultPath.startsWith(from)) {
		const newPath = vaultPath.replace(from, to);

		// remote leading slash if to = ""
		if (newPath.startsWith("/")) {
			return newPath.replace("/", "");
		}

		return newPath;
	}

	return vaultPath;
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * This is useful to prevent regex injection attacks or unintended matches.
 *
 * @param string - The string to escape.
 * @returns The escaped string.
 */
function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

/**
 * Fixes SVG elements for XML serialization by ensuring that style tags are not self-closed.
 * This is necessary because XMLSerializer tends to self-close empty style tags, which can cause issues.
 *
 * @param svgElement - The SVG element to fix.
 */
function fixSvgForXmlSerializer(svgElement: SVGSVGElement): void {
	// Insert a comment in the style tags to prevent XMLSerializer from self-closing it during serialization.
	const styles = svgElement.getElementsByTagName("style");

	if (styles.length > 0) {
		for (let i = 0; i < styles.length; i++) {
			const style = styles[i];

			if (!style.textContent?.trim()) {
				style.textContent = "/**/";
			}
		}
	}
}

/**
 * Sanitizes a permalink by ensuring it starts with a "/" and does not end with a "/".
 * This is useful for ensuring consistent permalink formatting.
 *
 * @param permalink - The permalink to sanitize.
 * @returns The sanitized permalink.
 */
function sanitizePermalink(permalink: string): string {
	if (permalink.endsWith("/")) {
		permalink.slice(0, -1);
	}

	if (!permalink.startsWith("/")) {
		permalink = "/" + permalink;
	}

	return permalink;
}

/**
 * Checks if a plugin is enabled in Obsidian.
 * It checks both the exact plugin ID and the lowercase version of it.
 *
 * @param pluginId - The ID of the plugin to check.
 * @returns True if the plugin is enabled, false otherwise.
 */
function isPluginEnabled(pluginId: string): boolean {
	//@ts-expect-error global app is available in Obsidian
	const plugins = app.plugins.enabledPlugins;

	return plugins.has(pluginId) || plugins.has(pluginId.toLowerCase());
}

/**
 * Cleans a query result in Markdown format.
 * It decodes URI escape characters, rewrites tag links, removes `.md` extensions from file links,
 * and rewrites Markdown links to use the Obsidian wikilinks format.
 *
 * @param markdown - The Markdown string to clean.
 * @returns The cleaned Markdown string.
 */
function cleanQueryResult(markdown: string): string {
	// Replace URI escape characters with their actual characters
	try {
		markdown = decodeURI(markdown);
	} catch {
		// decodeURI throws URIError if the string contains bare % not followed
		// by two hex digits (e.g. "进度：50%"). In that case, keep the
		// original string as-is.
	}

	// Rewrite tag links
	markdown = markdown.replace(
		/\[#([^\]]+)\]\(#([^)]+)\)/g,
		`<a href="tags/$2" class="tag-link">$1</a>`,
	);

	// Convert `#tag` to `<a href="tags/tag" class="tag-link">tag</a>`
	markdown = markdown.replace(
		/#([\w\\/]+)/g,
		`<a href="tags/$1" class="tag-link">$1</a>`,
	);

	// remove `.md` extension from file links
	markdown = markdown.replace(/(\[.*?\]\()(.+?)\.md(\))/g, "$1$2$3");

	// rewrite markdown links to use the Obsidian wikilinks format
	markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2|$1]]");

	return markdown.trim();
}

/**
 * Delays the execution of a promise until a specific selector is observed in the DOM.
 * It uses a MutationObserver to watch for changes in the specified HTMLDivElement.
 * If the element with the specified selector is found, it resolves the promise.
 * If the element is not found within the specified milliseconds, it rejects the promise with a timeout error.
 *
 * @param div - The HTMLDivElement to observe for the presence of a `.statblock` element.
 * @param selector - The CSS selector to observe for changes in the div.
 * @param timeout - The number of milliseconds to delay.
 * @param interval - The interval to keep chacking after the selector is found.
 * @returns A promise that resolves after the specified delay.
 */
function renderPromise(
	div: HTMLDivElement,
	selector: string,
	timeout: number = 5000,
	interval: number = 500,
) {
	return new Promise<void>((resolve, reject) => {
		let intervalTimer: NodeJS.Timeout;

		const observer = new MutationObserver(() => {
			clearTimeout(intervalTimer);

			intervalTimer = setTimeout(() => {
				cleanUp();
				resolve();
			}, interval);

			/*
			if (div.querySelector(selector)) {
				observer.disconnect();
				resolve();
			}
			*/
		});

		const cleanUp = () => {
			observer.disconnect();
			clearTimeout(intervalTimer);
			clearTimeout(timeoutTimer);
		};

		observer.observe(div, { childList: true, subtree: true });

		const timeoutTimer = setTimeout(() => {
			cleanUp();
			reject(new Notice(`Timeout waiting for selector: ${selector}`));
		}, timeout);
	});
}

/**
 * Surrounds the input with a callout block.
 * The depth of the callout block is determined by the depth parameter.
 *
 * @param input - The input text to surround with a callout block.
 * @param depth - The depth of the callout block (default is 1).
 * @returns The input text surrounded by a callout block.
 */
function surroundWithCalloutBlock(input: string, depth: number = 1): string {
	const tmp = input.split("\n");

	const calloutSymbol = "> ".repeat(depth);

	return " " + tmp.join(`\n${calloutSymbol}`);
}

/**
 * Checks if a query is inside a callout block.
 * Removes the callout symbols and re-join sanitized parts.
 * Also returns the boolean that indicates if the query was inside a callout.
 *
 * @param query - The query to sanitize.
 * @returns
 */
function sanitizeQuery(query: string): {
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

/**
 * Sanitizes HTML content to a string.
 * It removes unwanted elements, cleans internal links, converts callouts to Quartz-compatible format,
 * and unwraps the container to remove unnecessary wrapper elements.
 *
 * @param div - The HTMLDivElement containing the HTML content to sanitize.
 * @param serializer - The XMLSerializer used to serialize the sanitized HTML back to a string.
 * @returns The sanitized HTML as a string.
 */
function sanitizeHTMLToString(
	div: HTMLDivElement,
	serializer: XMLSerializer,
): string {
	const styleTags = div.querySelectorAll("style");

	// Let Obsidian handle the sanitization
	const sanitizedHtml = sanitizeHTMLToDom(div.innerHTML);

	let container = document.createElement("div");
	container.appendChild(sanitizedHtml);

	removeUnwantedElements(container, "script, link, meta, title");

	// Remove unwanted attributes from internal links
	const internalLinks = container.querySelectorAll(
		"a.internal-link, a.tag, a:not(.external-link):not(.internal-link):not(.tag)",
	);

	if (internalLinks.length > 0) {
		cleanAnchorLinks(container);
	}

	// Convert callouts Quartz-compatible format
	container = convertCallouts(container);

	// Unwrap the container to remove any unnecessary wrapper elements
	container = unwrap(container);

	const classes = container.classList;

	const markdownableClasses = ["datacore-table", "datacore-list"];

	const markdownableTagNames = [
		"p",
		//"blockquote",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"ul",
		"ol",
		"li",
		"table",
		"thead",
		"tbody",
		"tr",
		"td",
		"th",
	];

	// Return markdown version if it contains any of the classes
	// This is useful for HTML that has a markdown representation
	if (
		(classes.length > 0 &&
			Array.from(classes).some((cls) =>
				markdownableClasses.includes(cls),
			)) ||
		markdownableTagNames.includes(container.tagName.toLowerCase())
	) {
		const result = htmlToMarkdown(container) || "";

		return cleanQueryResult(result);
	}

	styleTags.forEach((styleTag) => {
		container.append(styleTag);
	});

	cleanDatacoreAttributes(container);

	// Serialize the sanitized HTML back to a string
	const serializedHtml = serializer.serializeToString(container);

	return serializedHtml.replace(' xmlns="http://www.w3.org/1999/xhtml"', "");
}

function cleanDatacoreAttributes(container: HTMLDivElement): void {
	const datacoreAttributes = ["__source", "__self"];

	const elements = container.querySelectorAll(
		`${datacoreAttributes.map((attr) => `[${attr}]`).join(", ")}`,
	);

	elements.forEach((element) => {
		datacoreAttributes.forEach((attr) => {
			element.removeAttribute(attr);
		});
	});
}

function convertCallouts(container: HTMLDivElement): HTMLDivElement {
	const callouts = container.querySelectorAll(".callout");

	if (callouts.length === 0) {
		return container;
	}

	callouts.forEach((callout) => {
		const blockquote = document.createElement(
			"blockquote",
		) as HTMLQuoteElement;

		// Map 'data-callout-fold' to the proper Quartz class
		if (callout.hasAttribute("data-callout-fold")) {
			if (callout.getAttribute("data-callout-fold") === "-") {
				blockquote.classList.add("is-collapsed");
			}

			callout.setAttribute("data-callout-fold", "");
		}

		if (!callout.hasAttribute("data-callout")) {
			// If the callout does not have a 'data-callout' attribute, we assume it's a default callout
			// In Quartz, the default callout is a note
			callout.setAttribute("data-callout", "note");
		}

		// Copy attributes from callout to blockquote
		for (let index = 0; index < callout.attributes.length; index++) {
			if (callout.attributes.item(index) !== null) {
				blockquote.setAttribute(
					callout.attributes.item(index)!.name,
					callout.attributes.item(index)!.value || "",
				);
			}
		}

		blockquote.innerHTML = callout.innerHTML;

		blockquote.classList.remove("datacore");

		// Add '.callout-content-inner' wrapper div to '.callout-content' if it exists
		// This is to ensure that the content is wrapped correctly for Quartz compatibility
		const calloutContent = blockquote.querySelector(".callout-content");

		if (calloutContent) {
			const innerWrapper = document.createElement("div");
			innerWrapper.classList.add("callout-content-inner");
			innerWrapper.innerHTML = calloutContent.innerHTML;
			calloutContent.innerHTML = "";
			calloutContent.appendChild(innerWrapper);
		}

		// Replace 'div.callout-fold' with 'div.callout-fold-icon'
		const calloutFold = blockquote.querySelector(".callout-fold");

		if (calloutFold) {
			calloutFold.classList.replace("callout-fold", "fold-callout-icon");
			const innerSVG = calloutFold.querySelector("svg");

			// Remove the 'svg' element from 'div.callout-fold-icon'
			if (innerSVG) {
				calloutFold.removeChild(innerSVG);
			}
		}

		// Add 'div.callout-icon' to 'div.callout-title' if it exists
		// This is to ensure that the icon is wrapped correctly for Quartz compatibility
		const calloutTitle = blockquote.querySelector(".callout-title");

		if (
			calloutTitle &&
			calloutTitle.children &&
			!calloutTitle.children[0].classList.contains("callout-icon")
		) {
			const icon = document.createElement("div");
			icon.classList.add("callout-icon");
			calloutTitle.prepend(icon);
		}

		callout.replaceWith(blockquote);
	});

	return container;
}

function cleanAnchorLinks(container: HTMLDivElement): void {
	const internalLinks = container.querySelectorAll(
		"a.internal-link, a.tag, a:not(.external-link):not(.internal-link):not(.tag)",
	);

	internalLinks.forEach((link) => {
		link.removeAttribute("target");
		link.removeAttribute("rel");
		link.removeAttribute("data-href");

		if (link.hasAttribute("href")) {
			if (link.getAttribute("href")?.startsWith("http")) {
				link.classList.add("external-link");
			} else {
				link.classList.add("internal-link");
			}
		}
	});
}

/**
 * Removes unwanted elements from the container based on the provided selector.
 * This is useful for cleaning up the HTML content by removing scripts, styles, and other unwanted elements.
 *
 * @param container - The HTMLDivElement containing the elements to remove.
 * @param selector - The CSS selector for the elements to remove.
 */
function removeUnwantedElements(
	container: HTMLDivElement,
	selector: string,
): void {
	const elements = container.querySelectorAll(selector);

	elements.forEach((element) => {
		element.remove();
	});
}

function unwrap(container: HTMLDivElement) {
	// Remove wrapper elements that might have been added by Obsidian
	while (
		container.attributes.length === 0 &&
		container.children.length === 1
	) {
		const child = container.firstElementChild;

		if (child) {
			container.replaceWith(child);
			container = child as HTMLDivElement;
		} else {
			break; // No more children to unwrap
		}
	}

	return container;
}

/**
 * Creates an image element with the SVG embedded as a data URL.
 *
 * @param svgElement - The SVG element to embed in the image.
 * @returns The image element with the SVG embedded as a data URL.
 */
function svgToData(svgElement: SVGSVGElement): string {
	const serializer = new XMLSerializer();
	const svgString = serializer.serializeToString(svgElement);

	const encodedData = btoa(unescape(encodeURIComponent(svgString)));

	return `data:image/svg+xml;base64,${encodedData}`;
}

/**
 * Tags that have a direct Markdown equivalent (whitelist).
 * Any tag NOT in this set makes a node "complex" and forces HTML output.
 */
const MARKDOWN_SAFE_TAGS = new Set([
	// Inline formatting
	"strong",
	"b",
	"em",
	"i",
	"del",
	"s",
	"code",
	"mark",
	"sub",
	"sup",
	// Links & media
	"a",
	"img",
	// Block elements
	"p",
	"div",
	"span",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"pre",
	"hr",
	// Lists
	"ul",
	"ol",
	"li",
	// Table structure
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
	"caption",
	// Misc
	"br",
]);

/**
 * Attributes whose mere presence on any element indicates content that
 * Markdown cannot faithfully represent.
 */
const COMPLEX_ATTRIBUTES = ["style", "colspan", "rowspan"];

/**
 * Recursively check whether a DOM node (and all its descendants) can be
 * faithfully represented in Markdown.
 *
 * Uses a **whitelist** of safe tags – any tag not in the set is considered
 * complex.  Additionally, certain attributes (`style`, `colspan`, `rowspan`)
 * and `<span>` elements carrying a `class` are treated as complex because
 * Markdown has no way to express them.
 */
function isMarkdownSafeNode(node: Node): boolean {
	// Text and comment nodes are always safe
	if (node.nodeType === Node.TEXT_NODE) return true;

	if (node.nodeType === Node.COMMENT_NODE) return true;

	if (node.nodeType !== Node.ELEMENT_NODE) return true;

	const el = node as HTMLElement;
	const tag = el.tagName.toLowerCase();

	// Tag must be in the whitelist
	if (!MARKDOWN_SAFE_TAGS.has(tag)) return false;

	// Reject elements with attributes that Markdown cannot represent
	for (const attr of COMPLEX_ATTRIBUTES) {
		if (el.hasAttribute(attr)) return false;
	}

	// <span> with a class carries styling intent that would be lost
	if (
		tag === "span" &&
		el.hasAttribute("class") &&
		el.getAttribute("class")?.trim()
	) {
		return false;
	}

	// Recursively check every child node
	for (const child of Array.from(node.childNodes)) {
		if (!isMarkdownSafeNode(child)) return false;
	}

	return true;
}

/**
 * Clean up Obsidian-style internal links (`<a class="internal-link" ...>`)
 * for Quartz consumption.
 *
 * - Removes `target`, `rel` attributes
 * - Strips `.md` extension from `href`
 * - Ensures the `internal-link` class is present
 *
 * Quartz's `CrawlLinks` plugin will pick up these `<a>` tags and resolve
 * them correctly (slug transformation, SPA navigation etc.).
 */
function cleanInternalLinks(el: HTMLElement): void {
	const links = el.querySelectorAll("a.internal-link, a[data-href]");

	for (const link of Array.from(links)) {
		link.removeAttribute("target");
		link.removeAttribute("rel");

		// Prefer data-href (Obsidian's canonical path), fall back to href
		const rawHref =
			link.getAttribute("data-href") || link.getAttribute("href") || "";

		// Block dangerous URL protocols to prevent XSS when the element
		// is later serialised via outerHTML.
		const trimmed = rawHref.trim().toLowerCase();

		if (
			trimmed.startsWith("javascript:") ||
			trimmed.startsWith("data:") ||
			trimmed.startsWith("vbscript:")
		) {
			link.setAttribute("href", "");
			link.removeAttribute("data-href");

			continue;
		}

		// encodeURI escapes HTML meta-characters (<, >, " etc.) while
		// preserving path separators – this also satisfies CodeQL's taint
		// analysis (recognised sanitiser for "DOM text → HTML" flows).
		const cleanHref = encodeURI(rawHref.replace(/\.md$/, ""));

		link.setAttribute("href", cleanHref);
		link.removeAttribute("data-href");

		if (!link.classList.contains("external-link")) {
			link.classList.add("internal-link");
		}
	}
}

/**
 * Convert the rendered HTML produced by DataviewJS (or similar) into a
 * string suitable for embedding in a Quartz Markdown file.
 *
 * The function processes each **top-level child** of `div` independently:
 * - Children that are fully representable in Markdown (checked via
 *   {@link isMarkdownSafeNode}) are converted with `htmlToMarkdown` and then
 *   cleaned with {@link cleanQueryResult}.
 * - Children containing complex HTML (e.g. `<progress>`, `<span class>`,
 *   merged cells, inline styles) are kept as raw HTML with internal links
 *   cleaned for Quartz.
 *
 * This approach correctly handles mixed content (e.g. an `<h2>` heading
 * followed by a complex `<table>`).
 */
function convertRenderedContent(div: HTMLDivElement): string {
	// Fast path: if everything is Markdown-safe, use the standard conversion
	if (isMarkdownSafeNode(div)) {
		const md = htmlToMarkdown(div) || "";

		return cleanQueryResult(md);
	}

	// Mixed / complex content: decide per top-level child
	const parts: string[] = [];

	for (const rawChild of Array.from(div.childNodes)) {
		if (rawChild.nodeType === Node.TEXT_NODE) {
			const text = rawChild.textContent?.trim();

			if (text) parts.push(text);

			continue;
		}

		if (rawChild.nodeType !== Node.ELEMENT_NODE) continue;

		const child = rawChild as HTMLElement;

		if (isMarkdownSafeNode(child)) {
			const md = htmlToMarkdown(child) || "";

			if (md.trim()) parts.push(cleanQueryResult(md));
		} else {
			// Keep as HTML; clean up internal links so Quartz can resolve them
			cleanInternalLinks(child);
			parts.push(child.outerHTML);
		}
	}

	return parts.join("\n\n");
}

export {
	generateUrlPath,
	generateBlobHash,
	wrapAround,
	getRewriteRules,
	getSyncerPathForNote,
	escapeRegExp,
	fixSvgForXmlSerializer,
	sanitizePermalink,
	isPluginEnabled,
	cleanQueryResult,
	renderPromise,
	sanitizeHTMLToString,
	surroundWithCalloutBlock,
	sanitizeQuery,
	removeUnwantedElements,
	svgToData,
	isMarkdownSafeNode,
	cleanInternalLinks,
	convertRenderedContent,
};
