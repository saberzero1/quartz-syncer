import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncHandler } from "src/cli/handlers/syncHandler";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishFile } from "src/publishFile/PublishFile";
import { buildParams, buildPlugin } from "./helpers";

describe("syncHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("publishes and deletes in a single run", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const fileB = { getVaultPath: () => "b.md" } as PublishFile;
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [fileB],
				published: [],
				deleted: ["c.md"],
			})),
			publishBatch: vi.fn(async () => ({
				success: true,
				filesPublished: 2,
				commitSha: "pub123",
			})),
			deleteBatch: vi.fn(async () => ({
				success: true,
				filesDeleted: 1,
				commitSha: "del456",
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createSyncHandler(plugin);

		const result = await handler(buildParams({}, ["force"]));
		expect(result).toEqual({
			success: true,
			data: {
				published: 2,
				deleted: 1,
				publishSha: "pub123",
				deleteSha: "del456",
			},
		});
	});

	it("uses custom messages for publish and delete", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
				published: [],
				deleted: ["old.md"],
			})),
			publishBatch: vi.fn(async () => ({
				success: true,
				filesPublished: 1,
				commitSha: "pub123",
			})),
			deleteBatch: vi.fn(async () => ({
				success: true,
				filesDeleted: 1,
				commitSha: "del456",
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createSyncHandler(plugin);

		await handler(buildParams({ message: "Sync commit" }, ["force"]));
		expect(publisher.publishBatch).toHaveBeenCalledWith(
			[fileA],
			"Sync commit",
		);
		expect(publisher.deleteBatch).toHaveBeenCalledWith(
			["old.md"],
			"Sync commit (deletions)",
		);
	});

	it("skips deletions without force", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
				published: [],
				deleted: ["c.md"],
			})),
			publishBatch: vi.fn(async () => ({
				success: true,
				filesPublished: 1,
				commitSha: "pub123",
			})),
			deleteBatch: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createSyncHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				published: 1,
				deleted: 0,
				publishSha: "pub123",
				deleteSha: undefined,
				warning: "Skipped deletions. Use 'force' to include deletions.",
			},
		});
		expect(publisher.deleteBatch).not.toHaveBeenCalled();
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createSyncHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("fails fast when publish fails", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
				published: [],
				deleted: ["c.md"],
			})),
			publishBatch: vi.fn(async () => ({
				success: false,
				error: "Publish failed",
			})),
			deleteBatch: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createSyncHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Publish failed",
		});
		expect(publisher.deleteBatch).not.toHaveBeenCalled();
	});
});
