import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DataStore,
	DATA_STORE_CACHE_VERSION,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import { App, type TFile } from "obsidian";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { DEFAULT_SETTINGS } from "src/main";

const { createInstance, dropInstance, setStore } = vi.hoisted(() => {
	let currentStore = new Map<string, unknown>();
	const setStore = (store: Map<string, unknown>) => {
		currentStore = store;
	};
	const createInstance = vi.fn(() => ({
		getItem: vi.fn((key: string) => Promise.resolve(currentStore.get(key))),
		getMany: vi.fn((keys: string[]) =>
			Promise.resolve(keys.map((key) => currentStore.get(key) ?? null)),
		),
		setItem: vi.fn((key: string, value: unknown) => {
			currentStore.set(key, value);
			return Promise.resolve();
		}),
		setMany: vi.fn((entries: Array<{ key: string; value: unknown }>) => {
			for (const { key, value } of entries) currentStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: vi.fn((key: string) => {
			currentStore.delete(key);
			return Promise.resolve();
		}),
		keys: vi.fn(() => Promise.resolve(Array.from(currentStore.keys()))),
		iterate: vi.fn(async (callback) => {
			for (const [key, value] of currentStore.entries()) {
				await callback(value, key);
			}
		}),
	}));

	return {
		createInstance,
		dropInstance: vi.fn(),
		setStore,
	};
});

vi.mock("src/cache/IndexedDBStore", () => ({
	CACHE_READ_BATCH_SIZE: 500,
	CACHE_WRITE_BATCH_SIZE: 500,
	createStore: createInstance,
	dropStore: dropInstance,
}));

describe("DataStore", () => {
	beforeEach(() => {
		setStore(new Map());
		createInstance.mockClear();
		dropInstance.mockClear();
	});

	it("returns cached file when mtime matches", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			false,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toEqual(["hello", { blobs: [] }]);
	});

	describe("storeRemoteHashes", () => {
		it.each([0, 1, 500, 501, 1001])(
			"merges and writes bounded batches for %i files without clobbering",
			async (count) => {
				const store = new DataStore("vault", "app", "1.0.0");
				const existing: QuartzSyncerCache = {
					version: "1.0.0",
					time: 10,
					sourceMtime: 20,
					localData: ["local", { blobs: [] }],
					localHash: "local-hash",
					remoteData: ["remote", { blobs: [] }],
					remoteHash: "old-remote",
					hasDynamicContent: true,
					mediaLinks: ["images/a.png"],
					dataviewRevision: 4,
					datacoreRevision: 8,
				};
				const entries = Array.from({ length: count }, (_, index) => ({
					path: `notes/${index}.md`,
					timestamp: 100 + index,
					hash: `new-${index}`,
				}));
				setStore(
					new Map(
						entries.map(({ path }) => [
							store.fileKey(path),
							existing,
						]),
					),
				);
				await store.storeRemoteHashes(entries);
				expect(store.persister.getItem).not.toHaveBeenCalled();
				expect(store.persister.setItem).not.toHaveBeenCalled();
				expect(store.persister.getMany).toHaveBeenCalledTimes(
					Math.ceil(count / 500),
				);
				expect(store.persister.setMany).toHaveBeenCalledTimes(
					Math.ceil(count / 500),
				);
				for (let offset = 0; offset < count; offset += 500) {
					const batch = entries.slice(offset, offset + 500);
					expect(store.persister.getMany).toHaveBeenNthCalledWith(
						offset / 500 + 1,
						batch.map(({ path }) => store.fileKey(path)),
					);
					expect(store.persister.setMany).toHaveBeenNthCalledWith(
						offset / 500 + 1,
						batch.map(({ path, timestamp, hash }) => ({
							key: store.fileKey(path),
							value: {
								...existing,
								version: "1.0.0",
								time: timestamp,
								remoteHash: hash,
							},
						})),
					);
				}
				for (const { path, timestamp, hash } of entries) {
					expect(await store.loadFile(path)).toEqual({
						...existing,
						version: "1.0.0",
						time: timestamp,
						remoteHash: hash,
					});
				}
			},
		);

		it("matches granular remote merges for missing entries, absent and empty links, and duplicate paths", async () => {
			const store = new DataStore("vault", "app", "1.0.0");
			await store.storeLocalHash("empty.md", 20, "local");
			await store.storeMediaLinks("empty.md", []);
			await store.storeLocalHash("absent.md", 20, "local");
			const entries = [
				"missing.md",
				"empty.md",
				"absent.md",
				"empty.md",
			].map((path, index) => ({
				path,
				timestamp: 100 + index,
				hash: `hash-${index}`,
			}));
			const initial = await store.exportCache();
			for (const { path, timestamp, hash } of entries)
				await store.storeRemoteHash(path, timestamp, hash);
			const expected = await store.exportCache();
			setStore(new Map(Object.entries(initial)));
			await store.storeRemoteHashes(entries);
			expect(await store.exportCache()).toEqual(expected);
			expect(await store.loadCachedMediaLinks("empty.md", 20)).toEqual(
				[],
			);
			expect(
				await store.loadCachedMediaLinks("absent.md", 20),
			).toBeNull();
		});
	});

	it("stores a complete compilation with one read and write, retaining remote fields", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		setStore(
			new Map([
				[
					"file:note.md",
					{
						version: "1.0.0",
						time: 1,
						sourceMtime: 1,
						remoteHash: "remote",
						remoteData: ["remote", { blobs: [] }],
					},
				],
			]),
		);
		await store.storeCompilation("note.md", {
			localData: ["compiled", { blobs: [] }],
			localHash: "compiled-hash",
			hasDynamicContent: true,
			sourceMtime: 2000,
			currentMtime: 2000,
			metadata: {
				mediaLinks: [],
				dataviewRevision: 2,
				datacoreRevision: 3,
			},
		});
		expect(store.persister.getItem).toHaveBeenCalledTimes(1);
		expect(store.persister.setItem).toHaveBeenCalledTimes(1);
		expect(await store.loadLocalFile("note.md", 2000, true)).toEqual([
			"compiled",
			{ blobs: [] },
		]);
		expect(await store.loadLocalHash("note.md", 2000)).toBe(
			"compiled-hash",
		);
		expect(await store.loadLocalHash("note.md", 3000)).toBeNull();
		expect(await store.loadCachedMediaLinks("note.md", 2000)).toEqual([]);
		expect(await store.loadCompilationRevisions("note.md")).toEqual({
			dataviewRevision: 2,
			datacoreRevision: 3,
		});
		expect(await store.loadRemoteHash("note.md")).toBe("remote");
		expect(await store.loadRemoteFile("note.md")).toEqual([
			"remote",
			{ blobs: [] },
		]);
	});

	it("returns null for cache miss", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		const cached = await store.loadLocalFile("notes/missing.md", 1000);
		expect(cached).toBeNull();
	});

	describe("loadCachedMediaLinks", () => {
		it("distinguishes a missing entry from cached empty links", async () => {
			const store = new DataStore("vault", "app", "1.0.0");

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
			await store.storeLocalHash("notes/a.md", 1000, "hash");
			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
			await store.storeMediaLinks("notes/a.md", []);
			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toEqual([]);
		});

		it("reads valid links", async () => {
			const store = new DataStore("vault", "app", "1.0.0");
			await store.storeLocalHash("notes/a.md", 1000, "hash");
			await store.storeMediaLinks("notes/a.md", ["images/a.png"]);

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toEqual(["images/a.png"]);
		});

		it.each<Partial<QuartzSyncerCache>>([
			{ sourceMtime: 500 },
			{ version: "0.9.0" },
		])("rejects stale links: %s", async (overrides) => {
			const store = new DataStore("vault", "app", "1.0.0");
			const entry: QuartzSyncerCache = {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				mediaLinks: ["images/old.png"],
				...overrides,
			};
			await store.persister.setItem("file:notes/a.md", entry);

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
		});

		it("preserves the legacy accessor's empty-array fallback", async () => {
			const store = new DataStore("vault", "app", "1.0.0");

			expect(await store.loadMediaLinks("notes/missing.md")).toEqual([]);
		});
	});

	it("invalidates cache when mtime changes", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			false,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 2000);

		expect(cached).toBeNull();
	});

	it("skips cached data for dynamic content", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			true,
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toBeNull();
	});

	it("persists writes immediately", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		await store.storeLocalHash("notes/test.md", 1000, "hash", 1000);

		expect(store.persister.setItem).toHaveBeenCalledTimes(1);
		expect(await store.loadLocalHash("notes/test.md", 1000)).toBe("hash");
	});

	describe("loadStatusMetadata", () => {
		it.each<Partial<QuartzSyncerCache> | null>([
			null,
			{},
			{ localHash: undefined, mediaLinks: undefined },
			{ localHash: "", mediaLinks: [] },
			{ mediaLinks: [] },
			{ sourceMtime: 500 },
			{ version: "0.9.0" },
			{ hasDynamicContent: true },
			{ sourceMtime: 0 },
		])("matches single-path validation for %s", async (overrides) => {
			const store = new DataStore("vault", "app", "1.0.0");
			if (overrides !== null) {
				await store.persister.setItem<QuartzSyncerCache>(
					"file:notes/a.md",
					{
						version: "1.0.0",
						time: 1000,
						sourceMtime: 1000,
						localHash: "hash",
						mediaLinks: ["images/a.png"],
						localData: ["large compiled content", { blobs: [] }],
						remoteData: ["large remote content", { blobs: [] }],
						...overrides,
					},
				);
			}
			const expected = {
				localHash: await store.loadLocalHash("notes/a.md", 1000),
				mediaLinks: await store.loadCachedMediaLinks(
					"notes/a.md",
					1000,
				),
			};
			vi.mocked(store.persister.getItem).mockClear();

			const result = await store.loadStatusMetadata([
				{ path: "notes/a.md", mtime: 1000 },
			]);

			expect(result).toEqual(new Map([["notes/a.md", expected]]));
			expect(store.persister.getItem).not.toHaveBeenCalled();
			if (overrides?.version === "0.9.0") {
				expect(expected).toEqual({
					localHash: null,
					mediaLinks: null,
				});
			}
		});

		it.each([0, 1, 499, 500, 501, 1000, 1001])(
			"projects bounded chunks for %i paths without retaining content",
			async (count) => {
				const store = new DataStore("vault", "app", "1.0.0");
				const files = Array.from({ length: count }, (_, index) => ({
					path: `notes/${index}.md`,
					mtime: index,
				}));
				for (const { path, mtime } of files) {
					await store.persister.setItem<QuartzSyncerCache>(
						`file:${path}`,
						{
							version: "1.0.0",
							time: mtime,
							sourceMtime: mtime,
							localHash: path,
							mediaLinks: [],
							localData: ["compiled", { blobs: [] }],
							remoteData: ["remote", { blobs: [] }],
						},
					);
				}

				const result = await store.loadStatusMetadata(files);

				expect([...result]).toEqual(
					files.map(({ path }) => [
						path,
						{ localHash: path, mediaLinks: [] },
					]),
				);
				expect(store.persister.getMany).toHaveBeenCalledTimes(
					Math.ceil(count / 500),
				);
				const calls = vi.mocked(store.persister.getMany).mock.calls;
				expect(calls.flatMap(([keys]) => keys)).toEqual(
					files.map(({ path }) => `file:${path}`),
				);
				for (const [keys] of calls)
					expect(keys.length).toBeLessThanOrEqual(500);
				expect(store.persister.getItem).not.toHaveBeenCalled();
				expect(store.persister.iterate).not.toHaveBeenCalled();
			},
		);
	});

	describe("deferred asset cache", () => {
		it("uses separate asset keys and bulk I/O, leaving file entries and null/empty links intact", async () => {
			const store = new DataStore("vault", "app", "1.0.0");
			await store.storeLocalFile("image.png", 1000, [
				"text",
				{ blobs: [] },
			]);
			await store.storeMediaLinks("image.png", []);
			const hashes = new Map([
				["image.png", { mtime: 1000, gitSha: "a".repeat(40) }],
				["other.png", { mtime: 2000, gitSha: "b".repeat(40) }],
			]);
			await store.storeAssetShas(hashes);
			expect(store.persister.setMany).toHaveBeenCalledExactlyOnceWith([
				{ key: "asset:image.png", value: hashes.get("image.png") },
				{ key: "asset:other.png", value: hashes.get("other.png") },
			]);
			vi.mocked(store.persister.getItem).mockClear();
			expect(
				await store.loadAssetShas([
					"image.png",
					"other.png",
					"missing.png",
				]),
			).toEqual(hashes);
			expect(store.persister.getMany).toHaveBeenCalledExactlyOnceWith([
				"asset:image.png",
				"asset:other.png",
				"asset:missing.png",
			]);
			expect(store.persister.getItem).not.toHaveBeenCalled();
			expect(await store.allFiles()).toEqual(["image.png"]);
			expect(await store.loadLocalFile("image.png", 1000)).toEqual([
				"text",
				{ blobs: [] },
			]);
			expect(await store.loadCachedMediaLinks("image.png", 1000)).toEqual(
				[],
			);
			expect(
				await store.loadCachedMediaLinks("other.png", 2000),
			).toBeNull();
		});

		it.each([
			{},
			{ mtime: 1000, gitSha: "invalid-sha" },
			{ mtime: NaN, gitSha: "a".repeat(40) },
			{ mtime: 1000, gitSha: null },
		])(
			"treats malformed asset SHA entries as misses: %s",
			async (entry) => {
				const store = new DataStore("vault", "app", "1.0.0");
				await store.persister.setItem("asset:image.png", entry);
				expect(await store.loadAssetShas(["image.png"])).toEqual(
					new Map(),
				);
			},
		);

		it("rejects legacy base64 entries and automatically recompiles without resurrecting remote payloads", async () => {
			const store = new DataStore(
				"vault",
				"app",
				`1.0.0-${DATA_STORE_CACHE_VERSION}`,
			);
			const legacy = {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				localHash: "old-hash",
				remoteHash: "old-hash",
				mediaLinks: [],
				localData: [
					"old",
					{ blobs: [{ path: "image.png", content: "AID/DQo=" }] },
				],
				remoteData: [
					"old",
					{ blobs: [{ path: "image.png", content: "AID/DQo=" }] },
				],
			};
			await store.persister.setItem("file:note.md", legacy);
			expect(await store.loadFile("note.md")).toBeNull();
			expect(await store.loadLocalFile("note.md", 1000, true)).toBeNull();
			expect(await store.loadRemoteFile("note.md")).toBeNull();
			expect(await store.isLocalFileOutdated("note.md", 1000)).toBe(true);
			expect(
				await store.loadStatusMetadata([
					{ path: "note.md", mtime: 1000 },
				]),
			).toEqual(
				new Map([["note.md", { localHash: null, mediaLinks: null }]]),
			);
			const app = new App();
			const settings = { ...DEFAULT_SETTINGS, useCache: true };
			vi.spyOn(app.vault, "cachedRead").mockResolvedValue("Hello\n");
			const binary = vi.spyOn(app.vault, "readBinary");
			const compiler = new SyncerPageCompiler(
				app,
				app.vault,
				settings,
				app.metadataCache,
				store,
			);
			const compile = vi.spyOn(compiler, "generateMarkdown");
			const file = new PublishFile({
				file: {
					path: "note.md",
					name: "note.md",
					extension: "md",
					stat: { mtime: 1000, ctime: 1000, size: 6 },
				} as TFile,
				compiler,
				vault: app.vault,
				metadataCache: app.metadataCache,
				settings,
				datastore: store,
			});
			expect((await file.compile(true)).getCompiledFile()).toEqual([
				"Hello\n",
				{ blobs: [] },
			]);
			await file.compile(true);
			expect(compile).toHaveBeenCalledTimes(1);
			expect(binary).not.toHaveBeenCalled();
			const healed = await store.loadFile("note.md");
			expect(healed?.version).toBe(store.version);
			expect(healed?.remoteData).toBeNull();
			expect(JSON.stringify(healed)).not.toContain("AID/DQo=");
		});

		it("does not promote stale payloads through single, bulk, or caller-supplied merges", async () => {
			const store = new DataStore("vault", "app", "current");
			const stale: QuartzSyncerCache = {
				version: "old",
				time: 1000,
				sourceMtime: 1000,
				localData: ["stale", { blobs: [] }],
				remoteData: ["stale", { blobs: [] }],
			};
			await store.persister.setItem("file:single.md", stale);
			await store.persister.setItem("file:bulk.md", stale);
			await store.storeMediaLinks("single.md", []);
			await store.storeRemoteHashes([
				{ path: "bulk.md", timestamp: 2000, hash: "new" },
			]);
			await store.storeCompilation(
				"supplied.md",
				{
					localData: ["new", { blobs: [] }],
					localHash: "new",
					hasDynamicContent: false,
					sourceMtime: 1000,
					currentMtime: 1000,
				},
				stale,
			);
			for (const path of ["single.md", "bulk.md", "supplied.md"]) {
				expect(await store.loadRemoteFile(path)).toBeNull();
				expect(
					JSON.stringify(await store.loadFile(path)),
				).not.toContain("stale");
			}
		});
	});

	it("exports an empty cache when no entries exist", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const result = await store.exportCache();

		expect(result).toEqual({});
	});

	it("exports all cached file entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", {
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
		await store.persister.setItem("file:notes/b.md", {
			version: "1.0.0",
			time: 200,
			sourceMtime: 200,
		});

		const result = await store.exportCache();

		expect(Object.keys(result).sort()).toEqual([
			"file:notes/a.md",
			"file:notes/b.md",
		]);
	});

	it("imports cache entries into the persister", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
			"file:notes/b.md": {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
			},
		});

		expect(count).toBe(2);
		expect(await store.persister.getItem("file:notes/a.md")).toEqual({
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
	});

	it("skips non-file keys when importing cache entries", async () => {
		const store = new DataStore("vault", "app", "1.0.0");

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
			metadata: {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
			},
		});

		expect(count).toBe(1);
		expect(await store.persister.getItem("metadata")).toBeUndefined();
	});

	it("roundtrips cache exports into a new store", async () => {
		const store = new DataStore("vault", "app", "1.0.0");
		await store.persister.setItem("file:notes/a.md", {
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
		});
		await store.persister.setItem("file:notes/b.md", {
			version: "1.0.0",
			time: 200,
			sourceMtime: 200,
		});

		const exported = await store.exportCache();

		setStore(new Map());
		const importedStore = new DataStore("vault", "app", "1.0.0");
		await importedStore.importCache(exported);
		const imported = await importedStore.exportCache();

		expect(imported).toEqual(exported);
	});
});
