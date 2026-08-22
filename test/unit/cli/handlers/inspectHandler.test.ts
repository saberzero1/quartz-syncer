import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInspectHandler } from "src/cli/handlers/inspectHandler";
import type { DataStore } from "src/cache/DataStore";
import { buildParams, buildPlugin } from "./helpers";

describe("inspectHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns queue status when target is queue", async () => {
		const plugin = buildPlugin({
			dataStore: {} as DataStore,
			getEngineStatus: vi.fn(() => ({
				running: true,
				pending: 3,
				autoPublish: false,
			})),
		});
		const handler = createInspectHandler(plugin);

		const result = await handler(buildParams({ target: "queue" }));
		expect(result).toEqual({
			success: true,
			data: {
				running: true,
				pending: 3,
				autoPublish: false,
			},
		});
	});

	it("returns idle queue status when engine is not running", async () => {
		const plugin = buildPlugin({
			dataStore: {} as DataStore,
			getEngineStatus: vi.fn(() => ({
				running: false,
				pending: 0,
				autoPublish: false,
			})),
		});
		const handler = createInspectHandler(plugin);

		const result = await handler(buildParams({ target: "queue" }));
		expect(result.data).toEqual({
			running: false,
			pending: 0,
			autoPublish: false,
		});
	});

	it("includes queue data when target is all", async () => {
		const dataStore = {
			allFiles: vi.fn(async () => ["a.md"]),
			loadLocalHash: vi.fn(async () => "hash"),
			loadRemoteHash: vi.fn(async () => "hash"),
			loadLocalFile: vi.fn(async () => ["content", { blobs: [] }]),
		} as unknown as DataStore;
		const plugin = buildPlugin({
			dataStore,
			getEngineStatus: vi.fn(() => ({
				running: false,
				pending: 0,
				autoPublish: true,
			})),
		});
		const handler = createInspectHandler(plugin);

		const result = await handler(buildParams({ target: "all" }));
		expect(result.success).toBe(true);
		const data = result.data as {
			queue: { running: boolean; pending: number; autoPublish: boolean };
		};
		expect(data.queue).toEqual({
			running: false,
			pending: 0,
			autoPublish: true,
		});
	});

	it("returns an error for unknown targets", async () => {
		const plugin = buildPlugin({
			dataStore: {} as DataStore,
			getEngineStatus: vi.fn(() => ({
				running: false,
				pending: 0,
				autoPublish: false,
			})),
		});
		const handler = createInspectHandler(plugin);

		const result = await handler(buildParams({ target: "something" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown target: something. Use cache, hashes, compilation, queue, or all.",
		});
	});
});
