if (!String.prototype.contains) {
	String.prototype.contains = String.prototype.includes;
}

declare const Buffer: {
	from: (buffer: ArrayBuffer) => {
		toString: (encoding: "base64") => string;
	};
};

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

export type EventRef = {
	event: string;
	callback: (...args: unknown[]) => void;
};

type DebouncedFunction<T extends (...args: unknown[]) => void> = (
	...args: Parameters<T>
) => void;

export function debounce<T extends (...args: unknown[]) => void>(
	callback: T,
	wait: number,
	immediate?: boolean,
): DebouncedFunction<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>): void => {
		const shouldCallNow = Boolean(immediate) && timeoutId === null;

		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			timeoutId = null;
			if (!immediate) {
				callback(...args);
			}
		}, wait);

		if (shouldCallNow) {
			callback(...args);
		}
	};
}

class MockElement {
	parentElement: MockElement | null = null;
	style: Record<string, string> = {};
	addClass = vi.fn();
	createDiv = vi.fn(() => new MockElement());
	createEl = vi.fn(() => new MockElement());
	createSpan = vi.fn(() => new MockElement());
	empty = vi.fn();
	setText = vi.fn();
	addEventListener = vi.fn();
}

export class Setting {
	constructor(_containerEl?: MockElement) {}
	setName = vi.fn().mockReturnThis();
	setDesc = vi.fn().mockReturnThis();
	setHeading = vi.fn().mockReturnThis();
	addText = vi.fn((callback: (text: unknown) => void) => {
		callback({
			setPlaceholder: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
		});
		return this;
	});
	addDropdown = vi.fn((callback: (dropdown: unknown) => void) => {
		callback({
			addOption: vi.fn().mockReturnThis(),
			addOptions: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
		});
		return this;
	});
	addToggle = vi.fn((callback: (toggle: unknown) => void) => {
		callback({
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
		});
		return this;
	});
	addButton = vi.fn((callback: (button: unknown) => void) => {
		callback({
			setButtonText: vi.fn().mockReturnThis(),
			setCta: vi.fn().mockReturnThis(),
			onClick: vi.fn().mockReturnThis(),
		});
		return this;
	});
}

export class Modal {
	app: App;
	modalEl = new MockElement();
	contentEl = new MockElement();
	titleEl = new MockElement();
	scope = { register: vi.fn() };
	constructor(app: App) {
		this.app = app;
	}
	open = vi.fn();
	close = vi.fn();
}

export const Platform = {
	isDesktopApp: true,
};

export const setIcon = vi.fn();

export class Plugin {
	app = new App();
	manifest = { version: "0.0.0", id: "test" };
	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addSettingTab = vi.fn();
	addCommand = vi.fn();
	addRibbonIcon = vi.fn();
	registerEvent = vi.fn();
	registerObsidianProtocolHandler = vi.fn();
	addStatusBarItem = vi.fn(() => ({
		setText: vi.fn(),
	}));
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

export class SettingPage {
	containerEl = new MockElement();
	title = "";
	display = vi.fn();
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
	getFileByPath = vi.fn().mockReturnValue(null);
	getMarkdownFiles = vi.fn().mockReturnValue([]);
	getName = vi.fn().mockReturnValue("test-vault");
	private listeners = new Map<string, Set<EventRef["callback"]>>();

	on = vi.fn((event: string, callback: EventRef["callback"]): EventRef => {
		const set = this.listeners.get(event) ?? new Set();
		set.add(callback);
		this.listeners.set(event, set);
		return { event, callback };
	});

	offref = vi.fn((ref: EventRef): void => {
		const set = this.listeners.get(ref.event);
		if (set) {
			set.delete(ref.callback);
		}
	});

	trigger(event: string, ...args: unknown[]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const callback of set) {
			callback(...args);
		}
	}
}

export class MetadataCache {
	getCache = vi.fn().mockReturnValue({});
	getFirstLinkpathDest = vi.fn().mockReturnValue(null);
	fileToLinktext = vi.fn().mockReturnValue("");
}

export class Workspace {
	onLayoutReady = vi.fn((callback: () => void) => {
		callback();
	});
	on = vi.fn().mockReturnValue({ id: "mock-event-ref" });
	off = vi.fn();
	offref = vi.fn();
	getActiveFile = vi.fn().mockReturnValue(null);
}

export class App {
	vault = new Vault();
	metadataCache = new MetadataCache();
	workspace = new Workspace();
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
