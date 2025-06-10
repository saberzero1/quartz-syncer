import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { sanitizeHTMLToDom, htmlToMarkdown } from "obsidian";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";

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

function generateBlobHash(content: string) {
	const byteLength = new TextEncoder().encode(content).byteLength;
	const header = `blob ${byteLength}\0`;
	const gitBlob = header + content;

	return sha1(gitBlob).toString();
}

const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};

function getRewriteRules(vaultPath: string): PathRewriteRule {
	return { from: vaultPath, to: "/" };
}

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

function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

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

function sanitizePermalink(permalink: string): string {
	if (permalink.endsWith("/")) {
		permalink.slice(0, -1);
	}

	if (!permalink.startsWith("/")) {
		permalink = "/" + permalink;
	}

	return permalink;
}

function isPluginEnabled(pluginId: string): boolean {
	//@ts-expect-error global app is available in Obsidian
	const plugins = app.plugins.enabledPlugins;

	return plugins.has(pluginId) || plugins.has(pluginId.toLowerCase());
}

function cleanQueryResult(markdown: string): string {
	// Replace URI escape characters with their actual characters
	markdown = decodeURI(markdown);

	// Rewrite tag links
	markdown = markdown.replace(/\[(#[^\]]+)\]\((#[^)]+)\)/g, "$2");

	// remove `.md` extension from file links
	markdown = markdown.replace(/(\[.*?\]\()(.+?)\.md(\))/g, "$1$2$3");

	// rewrite markdown links to use the Obsidian wikilinks format
	markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2|$1]]");

	return markdown.trim();
}

//delay async function
function delay(milliseconds: number) {
	return new Promise((resolve, _) => {
		setTimeout(resolve, milliseconds);
	});
}

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
	const internalLinks = container.querySelectorAll("a.internal-link, a.tag");

	internalLinks.forEach((link) => {
		link.removeAttribute("target");
		link.removeAttribute("rel");
		link.removeAttribute("data-href");
	});
}

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
};
