import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncHandler } from "src/cli/handlers/syncHandler";
import type { Publisher } from "src/publisher/Publisher";
import { buildParams, buildPlugin } from "./helpers";

describe("syncHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("publishes and deletes in a single run", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: ["a.md"],
				changed: ["b.md"],
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

		const result = await handler(buildParams());
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
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: ["a.md"],
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
