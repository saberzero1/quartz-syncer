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
				lines.push(`  - ${String(item)}`);
			}
		} else if (typeof value === "object" && value !== null) {
			lines.push(`${key}: ${JSON.stringify(value)}`);
		} else {
			lines.push(`${key}: ${String(value)}`);
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

export function parseYaml(_yaml: string): Record<string, unknown> {
	return {};
}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

export class Plugin {
	app = new App();
	manifest = { version: "0.0.0", id: "test" };
	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addSettingTab = vi.fn();
	addCommand = vi.fn();
	addRibbonIcon = vi.fn();
	registerEvent = vi.fn();
}

export class PluginSettingTab {
	app: App;
	constructor(app: App, _plugin: Plugin) {
		this.app = app;
	}
	getSettingDefinitions() {
		return [];
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
	cachedRead = vi.fn().mockResolvedValue("");
	read = vi.fn().mockResolvedValue("");
	readBinary = vi.fn().mockResolvedValue(new ArrayBuffer(0));
	getMarkdownFiles = vi.fn().mockReturnValue([]);
	getName = vi.fn().mockReturnValue("test-vault");
}

export class MetadataCache {
	getCache = vi.fn().mockReturnValue({});
	getFirstLinkpathDest = vi.fn().mockReturnValue(null);
	fileToLinktext = vi.fn().mockReturnValue("");
}

export class App {
	vault = new Vault();
	metadataCache = new MetadataCache();
	secretStorage = {
		getSecret: vi.fn().mockReturnValue(null),
		setSecret: vi.fn(),
		listSecrets: vi.fn().mockReturnValue([]),
	};
}

export const requestUrl = vi.fn();

export class SecretStorage {
	getSecret = vi.fn().mockReturnValue(null);
	setSecret = vi.fn();
	listSecrets = vi.fn().mockReturnValue([]);
}
