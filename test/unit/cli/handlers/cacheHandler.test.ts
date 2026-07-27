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

		const result = await handler(buildParams({ action: "prune" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: prune",
		});
	});
});
