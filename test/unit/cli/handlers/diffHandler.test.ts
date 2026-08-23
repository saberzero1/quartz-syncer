import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDiffHandler } from "src/cli/handlers/diffHandler";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { Publisher } from "src/publisher/Publisher";
import { buildParams, buildPlugin } from "./helpers";

const buildPublishFile = (path: string): PublishFile =>
	({
		getVaultPath: () => path,
	}) as unknown as PublishFile;

describe("diffHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns error when publisher is null", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createDiffHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("returns diffs for all unpublished and changed files", async () => {
		const unpublished = buildPublishFile("notes/a.md");
		const changed = buildPublishFile("notes/b.md");
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [unpublished],
				changed: [changed],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
			})),
			getLocalCompiledContent: vi.fn(async (file: PublishFile) =>
				file.getVaultPath() === "notes/a.md" ? "local-a" : "local-b",
			),
			getRemoteFileContent: vi.fn(async (path: string) =>
				path === "notes/a.md" ? "remote-a" : "remote-b",
			),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDiffHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				count: 2,
				diffs: [
					{
						path: "notes/a.md",
						status: "new",
						local: "local-a",
						remote: "remote-a",
					},
					{
						path: "notes/b.md",
						status: "changed",
						local: "local-b",
						remote: "remote-b",
					},
				],
			},
		});
	});

	it("marks unpublished as new and changed as changed", async () => {
		const unpublished = buildPublishFile("notes/new.md");
		const changed = buildPublishFile("notes/changed.md");
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [unpublished],
				changed: [changed],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
			})),
			getLocalCompiledContent: vi.fn(async () => "local"),
			getRemoteFileContent: vi.fn(async () => "remote"),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDiffHandler(plugin);

		const result = await handler(buildParams());
		const diffs = (result.data as { diffs: Array<{ status: string }> })
			.diffs;
		expect(diffs.map((diff) => diff.status)).toEqual(["new", "changed"]);
	});

	it("filters to a single file when path is provided", async () => {
		const target = buildPublishFile("notes/a.md");
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [target],
				changed: [buildPublishFile("notes/b.md")],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
			})),
			getLocalCompiledContent: vi.fn(async () => "local"),
			getRemoteFileContent: vi.fn(async () => "remote"),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDiffHandler(plugin);

		const result = await handler(buildParams({ path: "notes/a.md" }));
		expect(result).toEqual({
			success: true,
			data: {
				count: 1,
				diffs: [
					{
						path: "notes/a.md",
						status: "new",
						local: "local",
						remote: "remote",
					},
				],
			},
		});
	});

	it("returns error when path matches no pending file", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [buildPublishFile("notes/a.md")],
				changed: [buildPublishFile("notes/b.md")],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
			})),
			getLocalCompiledContent: vi.fn(),
			getRemoteFileContent: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createDiffHandler(plugin);

		const result = await handler(buildParams({ path: "nonexistent.md" }));
		expect(result).toEqual({
			success: false,
			error: "File not found or not pending: nonexistent.md",
		});
	});
});
