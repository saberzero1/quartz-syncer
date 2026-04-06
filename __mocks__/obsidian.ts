/**
 * Obsidian API mock for unit testing.
 *
 * Provides lightweight stubs for the Obsidian APIs consumed by the compiler
 * pipeline. Only the surface area actually called in tests is implemented;
 * everything else is left as a no-op or identity function.
 */

// Obsidian extends String.prototype with `contains` (alias for `includes`)
declare global {
	interface String {
		contains(target: string): boolean;
	}
}

if (!String.prototype.contains) {
	String.prototype.contains = String.prototype.includes;
}

export const getLinkpath = (link: string): string => {
	return link.replace(/#.*$/, "");
};

export function stringifyYaml(obj: Record<string, unknown>): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (Array.isArray(value)) {
			lines.push(`${key}:`);

			for (const item of value) {
				lines.push(`  - ${item}`);
			}
		} else if (typeof value === "object" && value !== null) {
			lines.push(`${key}: ${JSON.stringify(value)}`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}

	return lines.join("\n") + "\n";
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString("base64");
}

export function htmlToMarkdown(_html: string): string {
	return _html;
}

export function sanitizeHTMLToDom(_html: string): DocumentFragment {
	const fragment = new DocumentFragment();

	return fragment;
}

export function parseYaml(_yaml: string): Record<string, unknown> {
	return {};
}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

export class Component {
	load() {}
	unload() {}
	addChild<T extends Component>(child: T): T {
		return child;
	}
}

export class TFile {
	path = "";
	name = "";
	extension = "md";
	stat = { mtime: 0, ctime: 0, size: 0 };
	basename = "";
	vault = {};
	parent = null;
}

export class Vault {
	cachedRead = jest.fn().mockResolvedValue("");
	read = jest.fn().mockResolvedValue("");
	readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(0));
	getMarkdownFiles = jest.fn().mockReturnValue([]);
}

export class MetadataCache {
	getCache = jest.fn().mockReturnValue({});
	getFirstLinkpathDest = jest.fn().mockReturnValue(null);
	fileToLinktext = jest.fn().mockReturnValue("");
}

export class App {
	vault = new Vault();
	metadataCache = new MetadataCache();
}

export type FrontMatterCache = Record<string, unknown> & {
	position?: unknown;
};

export class FileManager {}

export const Platform = {
	isMobileApp: false,
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
};
