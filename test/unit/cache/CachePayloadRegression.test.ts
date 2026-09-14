import { Buffer } from "node:buffer";
import { App, TFile, type CachedMetadata } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "src/main";
import {
	DATA_STORE_CACHE_VERSION,
	DataStore,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import {
	CACHE_ASSET_MEAN_BYTES,
	CACHE_NOTE_BODY,
} from "../../bench/cache-fixture";

// Only the IndexedDB transport is mocked. Capture structured-cloned writes,
// never a sanitized projection that could discard a newly introduced payload.
vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: () => {
		const records = new Map<string, unknown>();
		return {
			getItem: vi.fn(async (key: string) =>
				structuredClone(records.get(key) ?? null),
			),
			setItem: vi.fn(async (key: string, value: unknown) => {
				records.set(key, structuredClone(value));
			}),
		};
	},
}));

const NOTE_COUNT = 20;
const MTIME = 1_700_000_000_000;
// Ceiling ratchet, not a target: lower by hand when the fixture footprint drops.
// 2 KiB/note leaves about 48% headroom over 1,384.85 bytes of persisted text +
// metadata (including one remote copy). A SINGLE 170 KiB asset cached as base64
// adds 11.3 KiB/note averaged over this 20-note fixture, decisively exceeding it.
// Deterministic bytes, not elapsed time: no host/CPU/GC-dependent tolerance.
// Never auto-update or raise this to accommodate payloads; review schema/prose
// changes explicitly before adjusting the hand-maintained ceiling.
const MAX_CACHE_BYTES_PER_NOTE = 2_048;

function fileAt(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").at(-1)!;
	file.basename = file.name.replace(/\.[^.]+$/, "");
	file.extension = path.split(".").at(-1)!;
	file.stat = { mtime: MTIME, ctime: MTIME, size: 0 };
	return file;
}

function assertNoBinary(value: unknown, location = "cache"): void {
	if (typeof value === "string") {
		expect(
			/[A-Za-z0-9+/]{128,}={0,2}|data:[^\s]*;base64,/.test(value),
			`${location} must not contain base64 payload content`,
		).toBe(false);
		return;
	}
	if (value === null || value === undefined || typeof value === "boolean")
		return;
	if (typeof value === "number") {
		expect(Number.isFinite(value), location).toBe(true);
		return;
	}
	if (Array.isArray(value)) {
		// Byte arrays must not slip through just because JSON supports arrays.
		expect(
			value.length > 0 &&
				value.every((item: unknown) => typeof item === "number"),
			`${location} must not contain a byte array`,
		).toBe(false);
		value.forEach((item: unknown, index) =>
			assertNoBinary(item, `${location}[${index}]`),
		);
		return;
	}
	expect(typeof value, location).toBe("object");
	// Reject ArrayBuffer, typed arrays, Buffer, Blob and other binary containers.
	expect(
		Object.getPrototypeOf(value),
		`${location} must be a plain record`,
	).toBe(Object.prototype);
	for (const [key, child] of Object.entries(
		value as Record<string, unknown>,
	)) {
		assertNoBinary(child, `${location}.${key}`);
	}
}

describe("compiled cache payload regression", () => {
	let persisted: Record<string, QuartzSyncerCache>;
	let datastore: DataStore;
	let app: App;
	const imagePath = "attachments/field-photo.png";

	beforeEach(async () => {
		vi.spyOn(Date, "now").mockReturnValue(MTIME);
		app = new App();
		const image = fileAt(imagePath);
		const binary = new Uint8Array(CACHE_ASSET_MEAN_BYTES);
		for (let index = 0; index < binary.length; index++)
			binary[index] = index % 251;
		vi.spyOn(app.vault, "readBinary").mockResolvedValue(binary.buffer);
		const settings = {
			...DEFAULT_SETTINGS,
			useCache: true,
			useDataview: false,
			showCreatedTimestamp: false,
			showUpdatedTimestamp: false,
		};
		datastore = new DataStore(
			"self-contained-cache-test",
			"quartz-syncer",
			DATA_STORE_CACHE_VERSION,
		);
		const compiler = new SyncerPageCompiler(
			app,
			app.vault,
			settings,
			app.metadataCache,
			datastore,
		);
		const embed = `![[${imagePath}]]`;
		const metadata = new Map<string, CachedMetadata>();
		vi.spyOn(app.metadataCache, "getCache").mockImplementation(
			(path) => metadata.get(path) ?? null,
		);
		vi.spyOn(app.metadataCache, "getFirstLinkpathDest").mockImplementation(
			(path) => (path === imagePath ? image : null),
		);
		vi.spyOn(app.metadataCache, "fileToLinktext").mockReturnValue(
			imagePath,
		);
		vi.spyOn(app.vault, "cachedRead").mockImplementation(
			async (file) =>
				CACHE_NOTE_BODY +
				(file.path === "notes/0.md" ? `\n${embed}\n` : ""),
		);
		persisted = {};
		for (let index = 0; index < NOTE_COUNT; index++) {
			const file = fileAt(`notes/${index}.md`);
			metadata.set(file.path, {
				frontmatter: { publish: true },
				embeds:
					index === 0
						? [
								{
									link: imagePath,
									original: embed,
									position: {
										start: { line: 0, col: 0, offset: 0 },
										end: {
											line: 0,
											col: embed.length,
											offset: embed.length,
										},
									},
								},
							]
						: [],
			});
			const note = new PublishFile({
				file,
				compiler,
				vault: app.vault,
				metadataCache: app.metadataCache,
				settings,
				datastore,
			});
			const compiled = await note.compile(false, {
				getMetadata: async () => ({
					mediaLinks: await compiler.extractBlobLinks(note),
				}),
			});
			// Also exercise merging a remote compiled value without dropping local data.
			if (index === 0)
				await datastore.storeRemoteFile(
					file.path,
					MTIME,
					compiled.getCompiledFile(),
				);
		}
		for (const [key] of vi.mocked(datastore.persister.setItem).mock.calls) {
			const entry =
				await datastore.persister.getItem<QuartzSyncerCache>(key);
			if (!entry) throw new Error(`Missing persisted entry: ${key}`);
			persisted[key] = entry;
		}
	});

	afterEach(() => vi.restoreAllMocks());

	it("persists only path references, with no binary content anywhere in the entry", () => {
		expect(Object.keys(persisted)).toHaveLength(NOTE_COUNT);
		expect(datastore.persister.setItem).toHaveBeenCalledTimes(
			NOTE_COUNT + 1,
		);
		assertNoBinary(persisted);
		for (const [key, value] of vi.mocked(datastore.persister.setItem).mock
			.calls) {
			assertNoBinary(value, `write:${key}`);
		}
		for (let index = 0; index < NOTE_COUNT; index++) {
			const entry = persisted[`file:notes/${index}.md`]!;
			expect(entry.version).toBe(DATA_STORE_CACHE_VERSION);
			expect(entry.localData?.[0]).toContain(
				"The trail follows the river",
			);
			expect(entry.localData?.[1]).toEqual({
				blobs:
					index === 0
						? [{ path: imagePath, vaultPath: imagePath }]
						: [],
			});
		}
		const mediaEntry = persisted["file:notes/0.md"]!;
		expect(mediaEntry.localData?.[0]).toContain(imagePath);
		expect(mediaEntry.mediaLinks).toEqual([imagePath]);
		expect(mediaEntry.remoteData).toEqual(mediaEntry.localData);
		expect(app.vault.readBinary).not.toHaveBeenCalled();
	});

	it("keeps persisted bytes per note below the hand-maintained ceiling", () => {
		// Independent from the shape guard: no path-only assertions before this.
		expect(Object.keys(persisted)).toHaveLength(NOTE_COUNT);
		const bytesPerNote =
			Buffer.byteLength(JSON.stringify(persisted)) / NOTE_COUNT;
		expect(
			bytesPerNote,
			`Persisted cache is ${bytesPerNote.toFixed(2)} bytes/note; ceiling is ${MAX_CACHE_BYTES_PER_NOTE}. Check for asset payload caching before reviewing the ratchet.`,
		).toBeLessThanOrEqual(MAX_CACHE_BYTES_PER_NOTE);
	});
});
