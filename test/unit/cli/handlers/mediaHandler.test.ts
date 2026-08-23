import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaHandler } from "src/cli/handlers/mediaHandler";
import type { MediaEntry } from "src/publisher/types";
import type { Publisher } from "src/publisher/Publisher";
import { buildParams, buildPlugin } from "./helpers";

const buildMedia = (overrides: Partial<MediaEntry>): MediaEntry => ({
	repoPath: "media/image.png",
	vaultPath: "media/image.png",
	sha: "sha",
	size: 123,
	linked: true,
	...overrides,
});

describe("mediaHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists all media files with linked status and size", async () => {
		const media = [
			buildMedia({ repoPath: "media/a.png", linked: true, size: 10 }),
			buildMedia({ repoPath: "media/b.png", linked: false, size: 20 }),
		];
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media,
				arbitrary: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(buildParams({ action: "list" }));
		expect(result).toEqual({
			success: true,
			data: {
				count: 2,
				files: [
					{ path: "media/a.png", linked: true, size: 10 },
					{ path: "media/b.png", linked: false, size: 20 },
				],
			},
		});
	});

	it("returns only orphaned media for orphaned action", async () => {
		const media = [
			buildMedia({ repoPath: "media/a.png", linked: true, size: 10 }),
			buildMedia({ repoPath: "media/b.png", linked: false, size: 20 }),
		];
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media,
				arbitrary: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(buildParams({ action: "orphaned" }));
		expect(result).toEqual({
			success: true,
			data: {
				count: 1,
				files: [{ path: "media/b.png", size: 20 }],
			},
		});
	});

	it("clean without force returns an error with orphan count", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [
					buildMedia({ repoPath: "media/a.png", linked: false }),
					buildMedia({ repoPath: "media/b.png", linked: false }),
				],
				arbitrary: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(buildParams({ action: "clean" }));
		expect(result).toEqual({
			success: false,
			error: "2 orphaned media file(s) found. Use force flag to delete.",
		});
	});

	it("clean with force and dry-run previews without delete", async () => {
		const deleteByRepoPaths = vi.fn();
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [
					buildMedia({ repoPath: "media/a.png", linked: false }),
					buildMedia({ repoPath: "media/b.png", linked: false }),
				],
				arbitrary: [],
			})),
			deleteByRepoPaths,
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(
			buildParams({ action: "clean" }, ["force", "dry-run"]),
		);
		expect(result).toEqual({
			success: true,
			data: {
				dryRun: true,
				wouldClean: 2,
				files: ["media/a.png", "media/b.png"],
			},
		});
		expect(deleteByRepoPaths).not.toHaveBeenCalled();
	});

	it("clean with force deletes orphaned media", async () => {
		const deleteByRepoPaths = vi.fn(async () => ({
			success: true,
			filesDeleted: 2,
		}));
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [
					buildMedia({ repoPath: "media/a.png", linked: false }),
					buildMedia({ repoPath: "media/b.png", linked: false }),
				],
				arbitrary: [],
			})),
			deleteByRepoPaths,
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(
			buildParams({ action: "clean" }, ["force"]),
		);
		expect(deleteByRepoPaths).toHaveBeenCalledWith(
			["media/a.png", "media/b.png"],
			"Clean orphaned media via CLI",
		);
		expect(result).toEqual({
			success: true,
			data: { cleaned: 2 },
			error: undefined,
		});
	});

	it("clean with force returns cleaned 0 when no orphaned files", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [buildMedia({ repoPath: "media/a.png", linked: true })],
				arbitrary: [],
			})),
			deleteByRepoPaths: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(
			buildParams({ action: "clean" }, ["force"]),
		);
		expect(result).toEqual({
			success: true,
			data: { cleaned: 0, message: "No orphaned media found" },
		});
	});

	it("clean with force propagates delete errors", async () => {
		const deleteByRepoPaths = vi.fn(async () => ({
			success: false,
			filesDeleted: 0,
			error: "Delete failed",
		}));
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [buildMedia({ repoPath: "media/a.png", linked: false })],
				arbitrary: [],
			})),
			deleteByRepoPaths,
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(
			buildParams({ action: "clean" }, ["force"]),
		);
		expect(result).toEqual({
			success: false,
			data: { cleaned: 0 },
			error: "Delete failed",
		});
	});

	it("returns error for unknown action", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(buildParams({ action: "nope" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: nope",
		});
	});

	it("defaults to list action when no action provided", async () => {
		const media = [buildMedia({ repoPath: "media/a.png", linked: true })];
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media,
				arbitrary: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createMediaHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				count: 1,
				files: [{ path: "media/a.png", linked: true, size: 123 }],
			},
		});
	});
});
