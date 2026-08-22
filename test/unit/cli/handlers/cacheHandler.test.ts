import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataStore } from "src/cache/DataStore";
import { createCacheHandler } from "src/cli/handlers/cacheHandler";
import { buildParams, buildPlugin } from "./helpers";

describe("cacheHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns cache status by default", async () => {
		const persister = {
			iterate: vi.fn(
				async (callback: (value: unknown, key: string) => void) => {
					callback({ foo: "bar" }, "file:notes/test.md");
				},
			),
		};
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => ["notes/test.md"]),
			persister,
		} as unknown as DataStore;

		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams());
		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			entries: 1,
			sizeEstimateBytes: expect.any(Number),
		});
	});

	it("clears the cache", async () => {
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "clear" }));
		expect(result).toEqual({ success: true, data: { cleared: true } });
		expect(dataStore.dropAllFiles).toHaveBeenCalledTimes(1);
	});

	it("clears a single cache entry", async () => {
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(
			buildParams({ action: "clear-file", path: "notes/test.md" }),
		);
		expect(result).toEqual({
			success: true,
			data: { cleared: "notes/test.md" },
		});
		expect(dataStore.dropFile).toHaveBeenCalledWith("notes/test.md");
	});

	it("exports cache entries", async () => {
		const dataStore = {
			exportCache: vi.fn(async () => ({
				"file:notes/a.md": {
					version: "1.0.0",
					time: 100,
					sourceMtime: 100,
				},
			})),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "export" }));
		expect(result).toEqual({
			success: true,
			data: {
				entries: 1,
				cache: {
					"file:notes/a.md": {
						version: "1.0.0",
						time: 100,
						sourceMtime: 100,
					},
				},
			},
		});
	});

	it("exports empty cache data when no entries exist", async () => {
		const dataStore = {
			exportCache: vi.fn(async () => ({})),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "export" }));
		expect(result).toEqual({
			success: true,
			data: { entries: 0, cache: {} },
		});
	});

	it("imports cache entries from JSON", async () => {
		const dataStore = {
			importCache: vi.fn(async () => 2),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);
		const payload = JSON.stringify({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
		});

		const result = await handler(
			buildParams({ action: "import", data: payload }),
		);
		expect(result).toEqual({
			success: true,
			data: { imported: 2 },
		});
		expect(dataStore.importCache).toHaveBeenCalledWith({
			"file:notes/a.md": {
				version: "1.0.0",
				time: 100,
				sourceMtime: 100,
			},
		});
	});

	it("returns an error when import data is missing", async () => {
		const dataStore = {
			importCache: vi.fn(async () => 0),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "import" }));
		expect(result).toEqual({
			success: false,
			error: "Missing data parameter",
		});
	});

	it("returns an error for invalid import JSON", async () => {
		const dataStore = {
			importCache: vi.fn(async () => 0),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(
			buildParams({ action: "import", data: "{invalid" }),
		);
		expect(result).toEqual({
			success: false,
			error: "Invalid JSON in data parameter",
		});
	});

	it("prunes outdated cache entries", async () => {
		const dataStore = {
			dropOutdatedCache: vi.fn(async () => undefined),
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "prune" }));
		expect(result).toEqual({
			success: true,
			data: { pruned: true },
		});
		expect(dataStore.dropOutdatedCache).toHaveBeenCalledTimes(1);
	});

	it("roundtrips cache export and import", async () => {
		const store = new Map<string, unknown>([
			[
				"file:notes/a.md",
				{ version: "1.0.0", time: 100, sourceMtime: 100 },
			],
			[
				"file:notes/b.md",
				{ version: "1.0.0", time: 200, sourceMtime: 200 },
			],
		]);
		const dataStore = {
			exportCache: vi.fn(async () => Object.fromEntries(store)),
			importCache: vi.fn(async (data) => {
				let count = 0;
				for (const [key, value] of Object.entries(data)) {
					store.set(key, value);
					count += 1;
				}
				return count;
			}),
			dropAllFiles: vi.fn(async () => {
				for (const key of [...store.keys()]) {
					if (key.startsWith("file:")) {
						store.delete(key);
					}
				}
			}),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () =>
				[...store.keys()]
					.filter((key) => key.startsWith("file:"))
					.map((key) => key.slice(5)),
			),
			persister: {
				iterate: vi.fn(async (callback) => {
					for (const [key, value] of store.entries()) {
						await callback(value, key);
					}
				}),
			},
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const exported = await handler(buildParams({ action: "export" }));
		const exportedData = exported.data as {
			cache: Record<string, unknown>;
		};
		await handler(buildParams({ action: "clear" }));
		const imported = await handler(
			buildParams({
				action: "import",
				data: JSON.stringify(exportedData.cache),
			}),
		);
		const status = await handler(buildParams());
		const statusData = status.data as { entries: number };

		expect(imported).toEqual({ success: true, data: { imported: 2 } });
		expect(statusData.entries).toBe(2);
	});

	it("returns an error when cache is unavailable", async () => {
		const plugin = buildPlugin({ dataStore: null as unknown as DataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "status" }));
		expect(result).toEqual({
			success: false,
			error: "Cache is not available",
		});
	});

	it("returns an error for missing clear-file path", async () => {
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "clear-file" }));
		expect(result).toEqual({
			success: false,
			error: "Missing path parameter",
		});
	});

	it("returns an error for unknown actions", async () => {
		const dataStore = {
			dropAllFiles: vi.fn(async () => undefined),
			dropFile: vi.fn(async () => undefined),
			allFiles: vi.fn(async () => []),
			persister: { iterate: vi.fn(async () => undefined) },
		} as unknown as DataStore;
		const plugin = buildPlugin({ dataStore });
		const handler = createCacheHandler(plugin);

		const result = await handler(buildParams({ action: "unknown" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: unknown",
		});
	});
});
