import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { sanitizeHTMLToDom, htmlToMarkdown } from "obsidian";
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
	markdown = decodeURI(markdown);

	// Rewrite tag links
	markdown = markdown.replace(
		/\[#([^\]]+)\]\(#([^)]+)\)/g,
		`<a href="tags/$2" class="tag-link">$1</a>`,
	);

	// remove `.md` extension from file links
	markdown = markdown.replace(/(\[.*?\]\()(.+?)\.md(\))/g, "$1$2$3");

	// rewrite markdown links to use the Obsidian wikilinks format
	markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2|$1]]");

	return markdown.trim();
}

/**
 * Delays the execution for a specified number of milliseconds.
 * This is useful for creating pauses in asynchronous operations.
 *
 * @param milliseconds - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
function delay(milliseconds: number) {
	return new Promise((resolve, _) => {
		setTimeout(resolve, milliseconds);
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
	// Let Obsidian handle the sanitization
	const sanitizedHtml = sanitizeHTMLToDom(div.innerHTML);

	let container = document.createElement("div");
	container.appendChild(sanitizedHtml);

	removeUnwantedElements(container, "script, style, link, meta, title");

	// Remove unwanted attributes from internal links
	const internalLinks = container.querySelectorAll("a.internal-link, a.tag");

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

	// Serialize the sanitized HTML back to a string
	const serializedHtml = serializer.serializeToString(container);

	return serializedHtml.replace(' xmlns="http://www.w3.org/1999/xhtml"', "");
}

/**
 * Converts callouts in the container to a Quartz-compatible format.
 * This function replaces the callout elements with a Quartz-compatible blockquote format.
 * It handles attributes, icons, and content structure to ensure compatibility with Quartz.
 *
 * @param container - The HTMLDivElement containing the callouts to convert.
 * @returns The container with callouts converted to Quartz-compatible format.
 */
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

/**
 * Cleans anchor links in the container by removing target, rel, and data-href attributes.
 * This is useful for internal links and tags to ensure they do not have unnecessary attributes
 * that could interfere with Quartz' SPA-navigation or styling.
 *
 * @param container - The HTMLDivElement containing the anchor links to clean.
 */
function cleanAnchorLinks(container: HTMLDivElement): void {
	const internalLinks = container.querySelectorAll("a.internal-link, a.tag");

	internalLinks.forEach((link) => {
		link.removeAttribute("target");
		link.removeAttribute("rel");
		link.removeAttribute("data-href");
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

/**
 * Unwraps the container by removing wrapper elements that might have been added by Obsidian.
 * It replaces the container with its first child if it has no attributes and only one child.
 *
 * @param container - The HTMLDivElement to unwrap.
 * @returns The unwrapped container.
 */
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
	delay,
	sanitizeHTMLToString,
	surroundWithCalloutBlock,
	sanitizeQuery,
};
