import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DataStore,
	DATA_STORE_CACHE_VERSION,
	type StaticQuartzSyncerCache,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import { App, type TFile } from "obsidian";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { DEFAULT_SETTINGS } from "src/main";
import { generateBlobHash } from "src/utils/utils";
import {
	DYNAMIC_CONTENT_DETECTOR_VERSION,
	settingsFingerprint,
} from "src/cache/CompiledEntryValidity";

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
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			[],
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toEqual(["hello", { blobs: [] }]);
	});

	it("fails closed when settings are unavailable at call time", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => undefined,
		);
		await store.persister.setItem("file:notes/test.md", {
			version: "1.0.0",
			time: 1000,
			sourceMtime: 1000,
			settingsFingerprint: "default-settings",
			detectorVersion: "vault-dependencies-v2",
			dynamicSources: [],
			localData: ["untrusted", { blobs: [] }],
			localHash: "untrusted-hash",
		});

		expect(await store.loadLocalFile("notes/test.md", 1000)).toBeNull();
		expect(await store.loadLocalHash("notes/test.md", 1000)).toBeNull();
		expect(
			await store.loadStatusMetadata([
				{ path: "notes/test.md", mtime: 1000 },
			]),
		).toEqual(
			new Map([
				[
					"notes/test.md",
					{
						localHash: null,
						mediaLinks: null,
						dynamicSources: null,
					},
				],
			]),
		);
		expect(store.persister.getItem).not.toHaveBeenCalled();
		expect(store.persister.getMany).not.toHaveBeenCalled();
		expect(() => store.getValidityCriteria(1000)).toThrow(
			"Cache validity requires current Quartz Syncer settings.",
		);
	});

	describe("storeRemoteHashes", () => {
		it.each([0, 1, 500, 501, 1001])(
			"merges and writes bounded batches for %i files without clobbering",
			async (count) => {
				const store = new DataStore(
					"vault",
					"app",
					"1.0.0",
					"",
					() => DEFAULT_SETTINGS,
				);
				const existing: QuartzSyncerCache = {
					version: "1.0.0",
					time: 10,
					sourceMtime: 20,
					settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
					detectorVersion: "vault-dependencies-v2",
					dynamicSources: [],
					localData: ["local", { blobs: [] }],
					localHash: "local-hash",
					remoteData: ["remote", { blobs: [] }],
					remoteHash: "old-remote",
					mediaLinks: ["images/a.png"],
				};
				const entries = Array.from({ length: count }, (_, index) => ({
					path: `notes/${index}.md`,
					timestamp: 100 + index,
					hash: `new-${index}`,
					sourceMtime: 20,
					currentMtime: 20,
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
					expect(await store.loadFile(path, 20)).toEqual({
						...existing,
						version: "1.0.0",
						time: timestamp,
						remoteHash: hash,
					});
				}
			},
		);

		it("matches granular remote merges for missing entries, absent and empty links, and duplicate paths", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			await store.storeLocalHash("empty.md", 20, "local", [], 20);
			await store.storeMediaLinks("empty.md", 20, [], 20);
			await store.storeLocalHash("absent.md", 20, "local", [], 20);
			const entries = [
				"missing.md",
				"empty.md",
				"absent.md",
				"empty.md",
			].map((path, index) => ({
				path,
				timestamp: 100 + index,
				hash: `hash-${index}`,
				sourceMtime: 20,
				currentMtime: 20,
			}));
			const initial = await store.exportCache();
			for (const {
				path,
				timestamp,
				hash,
				sourceMtime,
				currentMtime,
			} of entries)
				await store.storeRemoteHash(
					path,
					timestamp,
					hash,
					sourceMtime,
					currentMtime,
				);
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
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
			() => ({ dataviewRevision: 2, datacoreRevision: 3 }),
		);
		setStore(
			new Map([
				[
					"file:note.md",
					{
						version: "1.0.0",
						time: 1,
						sourceMtime: 1,
						settingsFingerprint:
							settingsFingerprint(DEFAULT_SETTINGS),
						detectorVersion: "vault-dependencies-v2",
						dynamicSources: [],
						remoteHash: "remote",
						remoteData: ["remote", { blobs: [] }],
					},
				],
			]),
		);
		await store.storeCompilation("note.md", {
			localData: ["compiled", { blobs: [] }],
			localHash: "compiled-hash",
			dynamicSources: ["dataview"],
			sourceMtime: 2000,
			currentMtime: 2000,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
			verifiedRevisions: {
				dataviewRevision: 2,
				datacoreRevision: undefined,
			},
			metadata: {
				mediaLinks: [],
			},
		});
		expect(store.persister.getItem).toHaveBeenCalledTimes(1);
		expect(store.persister.setItem).toHaveBeenCalledTimes(1);
		expect(await store.loadLocalFile("note.md", 2000)).toBeUndefined();
		expect(await store.loadLocalHash("note.md", 2000)).toBeNull();
		expect(await store.loadLocalHash("note.md", 3000)).toBeNull();
		expect(await store.loadCachedMediaLinks("note.md", 2000)).toBeNull();
		expect((await store.exportCache())["file:note.md"]).toMatchObject({
			dynamicSources: ["dataview"],
			dataviewRevision: 2,
		});
		expect(
			(await store.exportCache())["file:note.md"]?.datacoreRevision,
		).toBeUndefined();
		expect(await store.loadRemoteHash("note.md")).toBe("remote");
		expect(await store.loadRemoteFile("note.md")).toEqual([
			"remote",
			{ blobs: [] },
		]);
	});

	it.each([
		{
			name: "storeRemoteHash",
			write: (store: DataStore) =>
				store.storeRemoteHash(
					"note.md",
					2000,
					"new-remote",
					1000,
					1000,
				),
		},
		{
			name: "storeRemoteHashes",
			write: (store: DataStore) =>
				store.storeRemoteHashes([
					{
						path: "note.md",
						timestamp: 2000,
						hash: "new-remote",
						sourceMtime: 1000,
						currentMtime: 1000,
					},
				]),
		},
		{
			name: "storeRemoteFile",
			write: (store: DataStore) =>
				store.storeRemoteFile(
					"note.md",
					2000,
					["remote", { blobs: [] }],
					1000,
				),
		},
		{
			name: "storeMediaLinks",
			write: (store: DataStore) =>
				store.storeMediaLinks("note.md", 1000, ["image.png"], 1000),
		},
	])(
		"$name preserves dynamic classification and revisions",
		async ({ write }) => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
				() => ({ dataviewRevision: 11, datacoreRevision: 22 }),
			);
			await store.persister.setItem("file:note.md", {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: ["dataview", "datacore"],
				dataviewRevision: 11,
				datacoreRevision: 22,
			});

			await write(store);

			expect((await store.exportCache())["file:note.md"]).toMatchObject({
				sourceMtime: 1000,
				dynamicSources: ["dataview", "datacore"],
				dataviewRevision: 11,
				datacoreRevision: 22,
			});
		},
	);

	it.each([
		{
			name: "storeRemoteHash",
			write: (store: DataStore) =>
				store.storeRemoteHash(
					"note.md",
					2000,
					"new-remote",
					1000,
					3000,
				),
		},
		{
			name: "storeRemoteHashes",
			write: (store: DataStore) =>
				store.storeRemoteHashes([
					{
						path: "note.md",
						timestamp: 2000,
						hash: "new-remote",
						sourceMtime: 1000,
						currentMtime: 3000,
					},
				]),
		},
	])(
		"$name preserves classification when the file mtime moved during publish",
		async ({ write }) => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
				() => ({ dataviewRevision: 11, datacoreRevision: 22 }),
			);
			await store.persister.setItem("file:note.md", {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: ["dataview", "datacore"],
				dataviewRevision: 11,
				datacoreRevision: 22,
			});

			await write(store);

			const entry = (await store.exportCache())["file:note.md"];

			expect(entry).toMatchObject({
				dynamicSources: ["dataview", "datacore"],
				dataviewRevision: 11,
				datacoreRevision: 22,
				remoteHash: "new-remote",
			});
			expect(entry).not.toHaveProperty("localData");
			expect(entry).not.toHaveProperty("localHash");
		},
	);

	it("does not lose a concurrent metadata write to the same path", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
			() => ({ dataviewRevision: 11, datacoreRevision: 22 }),
		);
		await store.persister.setItem("file:note.md", {
			version: "1.0.0",
			time: 1000,
			sourceMtime: 1000,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
			dynamicSources: [],
		});

		await Promise.all([
			store.storeRemoteHash("note.md", 2000, "remote", 1000, 1000),
			store.storeMediaLinks("note.md", 1000, ["image.png"], 1000),
		]);

		expect((await store.exportCache())["file:note.md"]).toMatchObject({
			remoteHash: "remote",
			mediaLinks: ["image.png"],
		});
	});

	it("preserves classification when revision movement makes payload evidence stale", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
			() => ({ dataviewRevision: 12, datacoreRevision: undefined }),
		);
		await store.persister.setItem("file:note.md", {
			version: "1.0.0",
			time: 1000,
			sourceMtime: 1000,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
			dynamicSources: ["dataview"],
			dataviewRevision: 11,
		});

		await store.storeRemoteHash("note.md", 2000, "remote", 1000, 1000);

		const entry = (await store.exportCache())["file:note.md"];
		expect(entry?.dynamicSources).toEqual(["dataview"]);
		expect(entry?.dataviewRevision).toBe(11);
		expect(await store.loadFile("note.md", 1000)).toBeNull();
		const status = await store.loadStatusMetadata([
			{ path: "note.md", mtime: 1000 },
		]);
		expect(status.get("note.md")?.dynamicSources).toEqual(["dataview"]);
	});

	it("clears old revision evidence when recompilation cannot verify it", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
			() => ({ dataviewRevision: 11, datacoreRevision: undefined }),
		);
		const existing: QuartzSyncerCache = {
			version: "1.0.0",
			time: 1000,
			sourceMtime: 1000,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
			dynamicSources: ["dataview"],
			dataviewRevision: 11,
		};

		await store.storeCompilation(
			"note.md",
			{
				localData: ["compiled", { blobs: [] }],
				localHash: "compiled",
				dynamicSources: ["dataview"],
				sourceMtime: 1000,
				currentMtime: 1000,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
			},
			existing,
		);

		expect(
			(await store.exportCache())["file:note.md"]?.dataviewRevision,
		).toBeUndefined();
	});

	it("returns null for cache miss", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		const cached = await store.loadLocalFile("notes/missing.md", 1000);
		expect(cached).toBeNull();
	});

	describe("loadCachedMediaLinks", () => {
		it("distinguishes a missing entry from cached empty links", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
			await store.storeLocalHash("notes/a.md", 1000, "hash", [], 1000);
			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
			await store.storeMediaLinks("notes/a.md", 1000, [], 1000);
			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toEqual([]);
		});

		it("reads valid links", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			await store.storeLocalHash("notes/a.md", 1000, "hash", [], 1000);
			await store.storeMediaLinks(
				"notes/a.md",
				1000,
				["images/a.png"],
				1000,
			);

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toEqual(["images/a.png"]);
		});

		it.each<Partial<StaticQuartzSyncerCache>>([
			{ sourceMtime: 500 },
			{ version: "0.9.0" },
		])("rejects stale links: %s", async (overrides) => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			const entry: QuartzSyncerCache = {
				version: "1.0.0",
				time: 1000,
				sourceMtime: 1000,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
				mediaLinks: ["images/old.png"],
				...overrides,
			};
			await store.persister.setItem("file:notes/a.md", entry);

			expect(
				await store.loadCachedMediaLinks("notes/a.md", 1000),
			).toBeNull();
		});

		it("preserves the legacy accessor's empty-array fallback", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);

			expect(
				await store.loadMediaLinks("notes/missing.md", 1000),
			).toEqual([]);
		});

		it("does not return media links after the note mtime advances", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			await store.storeLocalHash("notes/a.md", 1000, "hash", [], 1000);
			await store.storeMediaLinks(
				"notes/a.md",
				1000,
				["images/a.png"],
				1000,
			);

			expect(await store.loadMediaLinks("notes/a.md", 2000)).toEqual([]);
		});
	});

	it("invalidates cache when mtime changes", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			[],
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 2000);

		expect(cached).toBeNull();
	});

	it("skips cached data for dynamic content", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["hello", { blobs: [] }],
			["dataview"],
			1000,
		);

		const cached = await store.loadLocalFile("notes/test.md", 1000);

		expect(cached).toBeNull();
	});

	it("persists writes immediately", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		await store.storeLocalHash("notes/test.md", 1000, "hash", [], 1000);

		expect(store.persister.setItem).toHaveBeenCalledTimes(1);
		expect(await store.loadLocalHash("notes/test.md", 1000)).toBe("hash");
	});

	it("does not retain an old payload when a hash is stored for a newer mtime", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["old payload", { blobs: [] }],
			[],
			1000,
		);

		await store.storeLocalHash("notes/test.md", 2000, "new-hash", [], 2000);

		expect(await store.loadLocalHash("notes/test.md", 2000)).toBe(
			"new-hash",
		);
		expect(await store.loadLocalFile("notes/test.md", 2000)).toBeNull();
	});

	it("hashes newly stored content instead of reusing an old hash", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.storeLocalHash("notes/test.md", 1000, "old-hash", [], 1000);

		await store.storeLocalFile(
			"notes/test.md",
			1000,
			["new payload", { blobs: [] }],
			[],
			1000,
		);

		expect(await store.loadLocalHash("notes/test.md", 1000)).toBe(
			await generateBlobHash("new payload"),
		);
	});

	it.each([
		{
			name: "storeRemoteHash",
			write: (store: DataStore) =>
				store.storeRemoteHash(
					"notes/test.md",
					1000,
					"remote",
					1000,
					1000,
				),
		},
		{
			name: "storeRemoteHashes",
			write: (store: DataStore) =>
				store.storeRemoteHashes([
					{
						path: "notes/test.md",
						timestamp: 1000,
						hash: "remote",
						sourceMtime: 1000,
						currentMtime: 1000,
					},
				]),
		},
		{
			name: "storeRemoteFile",
			write: (store: DataStore) =>
				store.storeRemoteFile(
					"notes/test.md",
					1000,
					["remote", { blobs: [] }],
					1000,
				),
		},
		{
			name: "storeMediaLinks",
			write: (store: DataStore) =>
				store.storeMediaLinks(
					"notes/test.md",
					1000,
					["images/a.png"],
					1000,
				),
		},
	])("$name preserves an unknown classification", async ({ write }) => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		await write(store);

		const exported = await store.exportCache();
		expect(exported["file:notes/test.md"]).not.toHaveProperty(
			"dynamicSources",
		);
		expect(exported["file:notes/test.md"]).not.toHaveProperty(
			"dataviewRevision",
		);
		expect(exported["file:notes/test.md"]).not.toHaveProperty(
			"datacoreRevision",
		);
	});

	it.each([
		{
			name: "storeLocalFile",
			write: (store: DataStore) =>
				store.storeLocalFile(
					"note.md",
					0,
					["local", { blobs: [] }],
					[],
					0,
				),
		},
		{
			name: "storeLocalHash",
			write: (store: DataStore) =>
				store.storeLocalHash("note.md", 0, "local", [], 0),
		},
		{
			name: "storeRemoteFile",
			write: (store: DataStore) =>
				store.storeRemoteFile(
					"note.md",
					1,
					["remote", { blobs: [] }],
					0,
				),
		},
		{
			name: "storeRemoteHash",
			write: (store: DataStore) =>
				store.storeRemoteHash("note.md", 1, "remote", 0, 0),
		},
		{
			name: "storeRemoteHashes",
			write: (store: DataStore) =>
				store.storeRemoteHashes([
					{
						path: "note.md",
						timestamp: 1,
						hash: "remote",
						sourceMtime: 0,
						currentMtime: 0,
					},
				]),
		},
		{
			name: "storeMediaLinks",
			write: (store: DataStore) =>
				store.storeMediaLinks("note.md", 0, [], 0),
		},
		{
			name: "storeCompilation",
			write: (store: DataStore) =>
				store.storeCompilation("note.md", {
					localData: ["local", { blobs: [] }],
					localHash: "local",
					dynamicSources: [],
					sourceMtime: 0,
					currentMtime: 0,
					settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
					detectorVersion: "vault-dependencies-v2",
				}),
		},
	])("$name cannot write sourceMtime zero", async ({ write }) => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		await write(store);

		expect(await store.exportCache()).toEqual({});
	});

	describe("loadStatusMetadata", () => {
		it.each<Record<string, unknown> | null>([
			null,
			{},
			{ localHash: undefined, mediaLinks: undefined },
			{ localHash: "", mediaLinks: [] },
			{ mediaLinks: [] },
			{ sourceMtime: 500 },
			{ version: "0.9.0" },
			{ dynamicSources: ["dataview"] },
			{ sourceMtime: 0 },
		])("matches single-path validation for %s", async (overrides) => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			if (overrides !== null) {
				await store.persister.setItem("file:notes/a.md", {
					version: "1.0.0",
					time: 1000,
					sourceMtime: 1000,
					settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
					detectorVersion: "vault-dependencies-v2",
					dynamicSources: [],
					localHash: "hash",
					mediaLinks: ["images/a.png"],
					localData: ["large compiled content", { blobs: [] }],
					remoteData: ["large remote content", { blobs: [] }],
					...overrides,
				});
			}
			const classificationInvalid =
				overrides === null ||
				overrides.version === "0.9.0" ||
				overrides.sourceMtime === 500 ||
				overrides.sourceMtime === 0;
			const expected = {
				localHash: await store.loadLocalHash("notes/a.md", 1000),
				mediaLinks: await store.loadCachedMediaLinks(
					"notes/a.md",
					1000,
				),
				dynamicSources: classificationInvalid
					? null
					: Array.isArray(overrides?.dynamicSources)
						? overrides.dynamicSources
						: [],
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
					dynamicSources: null,
				});
			}
		});

		it.each([0, 1, 499, 500, 501, 1000, 1001])(
			"projects bounded chunks for %i paths without retaining content",
			async (count) => {
				const store = new DataStore(
					"vault",
					"app",
					"1.0.0",
					"",
					() => DEFAULT_SETTINGS,
				);
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
							settingsFingerprint:
								settingsFingerprint(DEFAULT_SETTINGS),
							detectorVersion: "vault-dependencies-v2",
							dynamicSources: [],
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
						{ localHash: path, mediaLinks: [], dynamicSources: [] },
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

		it("computes validity criteria once per record", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			const files = Array.from({ length: 3 }, (_, index) => ({
				path: `notes/${index}.md`,
				mtime: index,
			}));
			const criteriaSpy = vi.spyOn(store, "getValidityCriteria");

			await store.loadStatusMetadata(files);

			expect(criteriaSpy).toHaveBeenCalledTimes(files.length);
			expect(criteriaSpy.mock.calls).toEqual(
				files.map(({ mtime }) => [mtime]),
			);
		});
	});

	describe("deferred asset cache", () => {
		it("uses separate asset keys and bulk I/O, leaving file entries and null/empty links intact", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			await store.storeLocalFile(
				"image.png",
				1000,
				["text", { blobs: [] }],
				[],
				1000,
			);
			await store.storeMediaLinks("image.png", 1000, [], 1000);
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
				const store = new DataStore(
					"vault",
					"app",
					"1.0.0",
					"",
					() => DEFAULT_SETTINGS,
				);
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
				"",
				() => DEFAULT_SETTINGS,
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
			expect(await store.loadFile("note.md", 1000)).toBeNull();
			expect(await store.loadLocalFile("note.md", 1000)).toBeNull();
			expect(await store.loadRemoteFile("note.md")).toBeNull();
			expect(await store.isLocalFileOutdated("note.md", 1000)).toBe(true);
			expect(
				await store.loadStatusMetadata([
					{ path: "note.md", mtime: 1000 },
				]),
			).toEqual(
				new Map([
					[
						"note.md",
						{
							localHash: null,
							mediaLinks: null,
							dynamicSources: null,
						},
					],
				]),
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
			const compile = vi.spyOn(compiler, "generateMarkdownWithEvidence");
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
			expect((await file.compile()).getCompiledFile()).toEqual([
				"Hello\n",
				{ blobs: [] },
			]);
			await file.compile();
			expect(compile).toHaveBeenCalledTimes(1);
			expect(binary).not.toHaveBeenCalled();
			const healed = await store.loadFile("note.md", 1000, settings);
			expect(healed?.version).toBe(store.version);
			expect(healed?.remoteData).toBeNull();
			expect(JSON.stringify(healed)).not.toContain("AID/DQo=");
		});

		it("does not promote stale payloads through single, bulk, or caller-supplied merges", async () => {
			const store = new DataStore(
				"vault",
				"app",
				"current",
				"",
				() => DEFAULT_SETTINGS,
			);
			const stale: QuartzSyncerCache = {
				version: "old",
				time: 1000,
				sourceMtime: 1000,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
				localData: ["stale", { blobs: [] }],
				remoteData: ["stale", { blobs: [] }],
			};
			await store.persister.setItem("file:single.md", stale);
			await store.persister.setItem("file:bulk.md", stale);
			await store.storeMediaLinks("single.md", 1000, [], 1000);
			await store.storeRemoteHashes([
				{
					path: "bulk.md",
					timestamp: 2000,
					hash: "new",
					sourceMtime: 1000,
					currentMtime: 1000,
				},
			]);
			await store.storeCompilation(
				"supplied.md",
				{
					localData: ["new", { blobs: [] }],
					localHash: "new",
					dynamicSources: [],
					sourceMtime: 1000,
					currentMtime: 1000,
					settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
					detectorVersion: "vault-dependencies-v2",
				},
				stale,
			);
			for (const path of ["single.md", "bulk.md", "supplied.md"]) {
				expect(await store.loadRemoteFile(path)).toBeNull();
				expect(
					JSON.stringify(await store.loadFile(path, 1000)),
				).not.toContain("stale");
			}
		});
	});

	it("exports an empty cache when no entries exist", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		const result = await store.exportCache();

		expect(result).toEqual({});
	});

	it("exports all cached file entries", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
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
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
			"file:notes/b.md": {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
		});

		expect(count).toBe(2);
		expect(await store.persister.getItem("file:notes/a.md")).toEqual({
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
			dynamicSources: [],
		});
	});

	it("skips non-file keys when importing cache entries", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		const count = await store.importCache({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
			metadata: {
				version: "1.0.0",
				time: 200,
				sourceMtime: 200,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
			"file:notes/zero.md": {
				version: "1.0.0",
				time: 200,
				sourceMtime: 0,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
		});

		expect(count).toBe(1);
		expect(await store.persister.getItem("metadata")).toBeUndefined();
		expect(
			await store.persister.getItem("file:notes/zero.md"),
		).toBeUndefined();
	});

	it.each([
		{
			name: "a dynamic record carrying a compiled payload",
			entry: {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: ["dataview"],
				localData: ["smuggled", { blobs: [] }],
				localHash: "smuggled",
			},
		},
		{
			name: "a static record carrying revision evidence",
			entry: {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
				dataviewRevision: 11,
			},
		},
		{
			name: "a fabricated classification",
			entry: {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [42],
			},
		},
		{
			name: "a record missing its settings fingerprint",
			entry: {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
				detectorVersion: "vault-dependencies-v2",
				dynamicSources: [],
			},
		},
	])("importCache rejects $name", async ({ entry }) => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);

		const count = await store.importCache({
			"file:notes/bad.md": entry,
		} as unknown as Record<string, QuartzSyncerCache>);

		expect(count).toBe(0);
		expect(
			await store.persister.getItem("file:notes/bad.md"),
		).toBeUndefined();
	});

	it("roundtrips cache exports into a new store", async () => {
		const store = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await store.persister.setItem("file:notes/a.md", {
			version: "1.0.0",
			time: 100,
			sourceMtime: 100,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
		});
		await store.persister.setItem("file:notes/b.md", {
			version: "1.0.0",
			time: 200,
			sourceMtime: 200,
			settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
			detectorVersion: "vault-dependencies-v2",
		});

		const exported = await store.exportCache();

		setStore(new Map());
		const importedStore = new DataStore(
			"vault",
			"app",
			"1.0.0",
			"",
			() => DEFAULT_SETTINGS,
		);
		await importedStore.importCache(exported);
		const imported = await importedStore.exportCache();

		expect(imported).toEqual(exported);
	});

	describe("remote-only accessor isolation", () => {
		// Structurally valid, but its local criteria are stale: the entry was
		// compiled at mtime 20 while the vault file now reports 2000.
		const seedStaleLocalEntry = () => {
			const store = new DataStore(
				"vault",
				"app",
				"1.0.0",
				"",
				() => DEFAULT_SETTINGS,
			);
			const entry: QuartzSyncerCache = {
				version: "1.0.0",
				time: 10,
				sourceMtime: 20,
				settingsFingerprint: settingsFingerprint(DEFAULT_SETTINGS),
				detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
				dynamicSources: [],
				localData: ["local", { blobs: [] }],
				localHash: "local-hash",
				remoteData: ["remote", { blobs: [] }],
				remoteHash: "remote-hash",
				mediaLinks: ["images/a.png"],
			};
			setStore(new Map([[store.fileKey("note.md"), entry]]));

			return store;
		};

		it("still serves remote reads", async () => {
			const store = seedStaleLocalEntry();

			expect(await store.loadRemoteHash("note.md")).toBe("remote-hash");
			expect(await store.loadRemoteFile("note.md")).toEqual([
				"remote",
				{ blobs: [] },
			]);
		});

		it("refuses every local read from that same entry", async () => {
			const store = seedStaleLocalEntry();

			expect(await store.loadLocalHash("note.md", 2000)).toBeNull();
			expect(await store.loadLocalFile("note.md", 2000)).toBeFalsy();
			expect(
				await store.loadCachedMediaLinks("note.md", 2000),
			).toBeNull();
			expect(await store.loadFile("note.md", 2000)).toBeNull();
		});
	});
});
