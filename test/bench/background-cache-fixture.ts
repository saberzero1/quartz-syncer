import { App, Events, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "src/main";
import {
	DATA_STORE_CACHE_VERSION,
	DataStore,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import type { IndexedDBStore } from "src/cache/IndexedDBStore";
import type QuartzSyncer from "src/main";
import { settingsFingerprint } from "src/cache/CompiledEntryValidity";

export const DYNAMIC_NOTE_COUNTS = [0, 100, 500, 1_000] as const;
export const DYNAMIC_NOTE_CONTENT =
	"---\npublish: true\n---\n`= this.file.name`\n";
export const STATIC_NOTE_COUNT = 3;

class MemoryIndexedDBStore implements IndexedDBStore {
	readonly values = new Map<string, unknown>();

	async getItem<T>(key: string): Promise<T | null> {
		return (structuredClone(this.values.get(key)) as T | undefined) ?? null;
	}

	async getMany<T>(keys: string[]): Promise<Array<T | null>> {
		return keys.map(
			(key) =>
				(structuredClone(this.values.get(key)) as T | undefined) ??
				null,
		);
	}

	async setItem<T>(key: string, value: T): Promise<void> {
		this.values.set(key, structuredClone(value));
	}

	async setMany<T>(entries: Array<{ key: string; value: T }>): Promise<void> {
		for (const { key, value } of entries) {
			this.values.set(key, structuredClone(value));
		}
	}

	async removeItem(key: string): Promise<void> {
		this.values.delete(key);
	}

	async keys(): Promise<string[]> {
		return [...this.values.keys()];
	}

	async iterate<T>(callback: (value: T, key: string) => void): Promise<void> {
		for (const [key, value] of this.values) {
			callback(structuredClone(value) as T, key);
		}
	}

	close(): void {}
}

function makeNote(path: string, mtime: number): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.substring(path.lastIndexOf("/") + 1);
	file.basename = file.name.replace(/\.md$/, "");
	file.extension = "md";
	file.stat = { ctime: mtime, mtime, size: 64 };
	return file;
}

export type BackgroundCacheFixture = ReturnType<
	typeof createBackgroundCacheFixture
>;

export function createBackgroundCacheFixture(
	dynamicCount: number,
	staticCount = STATIC_NOTE_COUNT,
) {
	const settings = {
		...DEFAULT_SETTINGS,
		allNotesPublishableByDefault: true,
		useCache: true,
		useDataview: true,
	};
	const app = new App();
	const dynamicFiles = Array.from({ length: dynamicCount }, (_, index) =>
		makeNote(`dynamic/note-${index}.md`, 1_000),
	);
	const staticFiles = Array.from({ length: staticCount }, (_, index) =>
		makeNote(`static/note-${index}.md`, 1_000),
	);
	const files = [...dynamicFiles, ...staticFiles];
	const content = new Map(
		files.map((file) => [
			file.path,
			dynamicFiles.includes(file)
				? DYNAMIC_NOTE_CONTENT
				: "---\npublish: true\n---\nStatic note\n",
		]),
	);
	app.vault.getFileByPath = (path: string) =>
		files.find((file) => file.path === path) ?? null;
	app.vault.getFiles = () => files.slice();
	app.vault.getMarkdownFiles = () => files.slice();
	app.vault.cachedRead = async (file: TFile) => content.get(file.path) ?? "";
	app.vault.read = app.vault.cachedRead;
	app.metadataCache.getFileCache = () =>
		({
			frontmatter: { publish: true },
		}) as ReturnType<typeof app.metadataCache.getFileCache>;
	const metadataEvents = app.metadataCache as unknown as {
		on: typeof app.workspace.on;
		offref: typeof app.workspace.offref;
	};
	metadataEvents.on = app.workspace.on.bind(app.workspace);
	metadataEvents.offref = app.workspace.offref.bind(app.workspace);

	const dataStore = new DataStore(
		"bench-app",
		"quartz-syncer",
		`bench-${DATA_STORE_CACHE_VERSION}`,
		"bench-vault",
		() => settings,
	);
	const persister = new MemoryIndexedDBStore();
	dataStore.persister = persister;
	const entry = (dynamic: boolean): QuartzSyncerCache => {
		const common = {
			version: dataStore.version,
			time: 1_000,
			sourceMtime: 1_000,
			settingsFingerprint: settingsFingerprint(settings),
			detectorVersion: "vault-dependencies-v2",
		};
		return dynamic
			? {
					...common,
					dynamicSources: ["dataview"],
					dataviewRevision: 1,
				}
			: {
					...common,
					dynamicSources: [],
					localData: ["compiled", { blobs: [] }],
					localHash: "a".repeat(40),
					mediaLinks: [],
				};
	};
	for (const file of dynamicFiles) {
		persister.values.set(`file:${file.path}`, entry(true));
	}
	for (const file of staticFiles) {
		persister.values.set(`file:${file.path}`, entry(false));
	}

	const plugin = {
		settings,
		dataStore,
		cacheHandle: null,
		getPublisher: () => null,
		statusCache: {
			markStaleFile: () => undefined,
			getSummary: () => null,
		},
	} as unknown as QuartzSyncer;

	const dataviewApi = {
		settings: {},
		index: { initialized: true, revision: 2 },
		page: () => ({}),
		tryEvaluate: () => "note",
		executeJs: async () => undefined,
		tryQueryMarkdown: async () => "",
	};

	return {
		app,
		plugin,
		dataStore,
		persister,
		dynamicFiles,
		staticFiles,
		content,
		dataviewApi,
		triggerDataviewRevision(): void {
			(app.workspace as Events).trigger(
				"dataview:metadata-change",
				"update",
				staticFiles[0],
			);
		},
		modifyUnrelatedStaticNote(): TFile {
			const file = staticFiles[0]!;
			file.stat.mtime = 2_000;
			content.set(
				file.path,
				"---\npublish: true\n---\nModified static note\n",
			);
			app.vault.trigger("modify", file);
			return file;
		},
	};
}
