import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusHandler } from "src/cli/handlers/statusHandler";
import type { Publisher } from "src/publisher/Publisher";
import type QuartzSyncer from "src/main";
import { buildParams, buildPlugin } from "./helpers";

describe("statusHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns publish status counts", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: ["a.md"],
				changed: ["b.md", "c.md"],
				published: ["d.md"],
				deleted: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createStatusHandler(plugin);

		const result = await handler(buildParams({ format: "json" }));
		expect(result).toEqual({
			success: true,
			data: {
				unpublished: 1,
				changed: 2,
				published: 1,
				deleted: 0,
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createStatusHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("includes publish flags and media info in verbose output", async () => {
		const fileA = {
			getVaultPath: () => "a.md",
			shouldPublish: () => true,
			file: { path: "a.md" },
		};
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
				published: [],
				deleted: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
			dataStore: {
				loadLocalFile: vi.fn(async () => ["content", { blobs: [1] }]),
			} as unknown as QuartzSyncer["dataStore"],
		});
		const handler = createStatusHandler(plugin);

		const result = await handler(buildParams({}, ["verbose"]));
		expect(result.success).toBe(true);
		const data = result.data as {
			unpublished: {
				files: Array<{
					path: string;
					publishFlag: boolean;
					hasMedia: boolean;
				}>;
			};
		};
		expect(data.unpublished.files[0]).toEqual({
			path: "a.md",
			publishFlag: true,
			hasMedia: true,
		});
	});
});
