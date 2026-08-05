import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublishHandler } from "src/cli/handlers/publishHandler";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishFile } from "src/publishFile/PublishFile";
import { buildParams, buildPlugin } from "./helpers";

describe("publishHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("publishes unpublished and changed files", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const fileB = { getVaultPath: () => "b.md" } as PublishFile;
		const publishBatch = vi.fn(async () => ({
			success: true,
			filesPublished: 2,
			commitSha: "abc123",
		}));
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [fileB],
				published: [],
				deleted: [],
			})),
			publishBatch,
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(buildParams());
		expect(publishBatch).toHaveBeenCalledWith(
			[fileA, fileB],
			"Published via Quartz Syncer CLI",
		);
		expect(result).toEqual({
			success: true,
			data: {
				success: true,
				filesPublished: 2,
				commitSha: "abc123",
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createPublishHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("returns publish errors from the publisher", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
				published: [],
				deleted: [],
			})),
			publishBatch: vi.fn(async () => ({
				success: false,
				error: "Publish failed",
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Publish failed",
		});
	});
});
