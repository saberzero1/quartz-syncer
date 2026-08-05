import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeleteHandler } from "src/cli/handlers/deleteHandler";
import type { Publisher } from "src/publisher/Publisher";
import { buildParams, buildPlugin } from "./helpers";

describe("deleteHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes removed files", async () => {
		const deleteBatch = vi.fn(async () => ({
			success: true,
			filesDeleted: 1,
			commitSha: "def456",
		}));
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: ["old.md"],
			})),
			deleteBatch,
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDeleteHandler(plugin);

		const result = await handler(buildParams({}, ["force"]));
		expect(deleteBatch).toHaveBeenCalledWith(
			["old.md"],
			"Deleted via Quartz Syncer CLI",
		);
		expect(result).toEqual({
			success: true,
			data: {
				success: true,
				filesDeleted: 1,
				commitSha: "def456",
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createDeleteHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("requires force for deletions", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: ["old.md"],
			})),
			deleteBatch: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDeleteHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Destructive operation requires the 'force' flag.",
		});
	});

	it("returns delete errors from the publisher", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: ["old.md"],
			})),
			deleteBatch: vi.fn(async () => ({
				success: false,
				error: "Delete failed",
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDeleteHandler(plugin);

		const result = await handler(buildParams({}, ["force"]));
		expect(result).toEqual({
			success: false,
			error: "Delete failed",
		});
	});
});
