import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeleteHandler } from "src/cli/handlers/deleteHandler";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { PublishStatus } from "src/publisher/types";
import { buildParams, buildPlugin } from "./helpers";

describe("deleteHandler", () => {
	function unpublishFixture(count = 3) {
		const file = (path: string) =>
			({ getVaultPath: () => path }) as PublishFile;
		const status: PublishStatus = {
			unpublished: [file("new.md")],
			changed: [file("changed.md")],
			published: Array.from({ length: count }, (_, index) =>
				file(`notes/post-${index}.md`),
			),
			deleted: ["old.md"],
			media: [],
			arbitrary: [],
		};
		const getPublishStatus = vi
			.fn<Publisher["getPublishStatus"]>()
			.mockResolvedValue(status);
		const deleteBatch = vi
			.fn<Publisher["deleteBatch"]>()
			.mockResolvedValue({
				success: true,
				filesPublished: 0,
				filesDeleted: 1,
			});
		const publisher = {
			getPublishStatus,
			deleteBatch,
		} as unknown as Publisher;
		const handler = createDeleteHandler(
			buildPlugin({ getPublisher: () => publisher }),
		);
		return { handler, getPublishStatus, deleteBatch };
	}

	it.each<[string, string[]]>([
		["notes/post-1.md", ["notes/post-1.md"]],
		[
			"notes/post-*.md",
			["notes/post-0.md", "notes/post-1.md", "notes/post-2.md"],
		],
		["notes/**", ["notes/post-0.md", "notes/post-1.md", "notes/post-2.md"]],
		["~POST 1", ["notes/post-1.md"]],
	])("explicitly unpublishes using path %s", async (path, files) => {
		const f = unpublishFixture();
		const result = await f.handler(
			buildParams(
				{ action: "unpublish", path, message: "Unpublish selected" },
				["force", "verbose"],
			),
		);
		expect(f.deleteBatch).toHaveBeenCalledExactlyOnceWith(
			files,
			"Unpublish selected",
		);
		expect(result).toMatchObject({ success: true, data: { files } });
	});

	it.each([{ flags: [] }, { flags: ["dry-run"] }])(
		"requires force even for unpublish previews: %j",
		async ({ flags }) => {
			const f = unpublishFixture();
			const result = await f.handler(
				buildParams(
					{ action: "unpublish", path: "notes/post-1.md" },
					flags,
				),
			);
			expect(result).toMatchObject({
				success: false,
				error: "Destructive operation requires the 'force' flag.",
			});
			expect(f.getPublishStatus).not.toHaveBeenCalled();
			expect(f.deleteBatch).not.toHaveBeenCalled();
		},
	);

	it.each([
		undefined,
		"",
		" ",
		"missing.md",
		"old.md",
		"new.md",
		"changed.md",
		"~missing",
		"missing/*",
		"~",
		"~---",
		"notes/*?.md",
	])("rejects missing, invalid, or ineligible paths: %s", async (path) => {
		const f = unpublishFixture();
		const result = await f.handler(
			buildParams(
				{
					action: "unpublish",
					...(path === undefined ? {} : { path }),
				},
				["force"],
			),
		);
		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();
		expect(f.deleteBatch).not.toHaveBeenCalled();
	});

	it.each([
		buildParams({ path: "notes/post-1.md" }, ["force"]),
		buildParams({ action: "unpbulish" }, ["force"]),
		buildParams({}, ["force", "action"]),
		buildParams({}, ["force", "path"]),
	])(
		"does not fall back to removed-note deletion on malformed requests: %j",
		async (params) => {
			const f = unpublishFixture();
			expect((await f.handler(params)).success).toBe(false);
			expect(f.deleteBatch).not.toHaveBeenCalled();
		},
	);

	it("previews exactly the matched published notes without deletion", async () => {
		const f = unpublishFixture();
		expect(
			await f.handler(
				buildParams({ action: "unpublish", path: "~post 1" }, [
					"force",
					"dry-run",
				]),
			),
		).toEqual({
			success: true,
			data: { files: ["notes/post-1.md"] },
		});
		expect(f.deleteBatch).not.toHaveBeenCalled();
	});

	it.each(["notes/*", "~post"])(
		"blocks broad pattern %s but allows preview",
		async (path) => {
			const f = unpublishFixture(6);
			const args = { action: "unpublish", path };
			const preview = await f.handler(
				buildParams(args, ["force", "dry-run"]),
			);
			expect(preview).toMatchObject({
				success: true,
				data: {
					warning: expect.stringContaining("80%"),
					files: expect.any(Array),
				},
			});
			const result = await f.handler(buildParams(args, ["force"]));
			expect(result).toMatchObject({
				success: false,
				error: expect.stringContaining("80%"),
				data: {
					files: Array.from(
						{ length: 6 },
						(_, index) => `notes/post-${index}.md`,
					),
				},
			});
			expect(f.deleteBatch).not.toHaveBeenCalled();
		},
	);

	it("allows an exact path in a larger publication set", async () => {
		const f = unpublishFixture(6);
		expect(
			(
				await f.handler(
					buildParams(
						{ action: "unpublish", path: "notes/post-1.md" },
						["force"],
					),
				)
			).success,
		).toBe(true);
		expect(f.deleteBatch).toHaveBeenCalledExactlyOnceWith(
			["notes/post-1.md"],
			"Unpublished via Quartz Syncer CLI",
		);
	});

	it("keeps default deletion and its preview deleted-only with published notes present", async () => {
		const f = unpublishFixture();
		expect(await f.handler(buildParams({}, ["force", "dry-run"]))).toEqual({
			success: true,
			data: { files: ["old.md"] },
		});
		expect(f.deleteBatch).not.toHaveBeenCalled();
		await f.handler(buildParams({}, ["force"]));
		expect(f.deleteBatch).toHaveBeenCalledExactlyOnceWith(
			["old.md"],
			"Deleted via Quartz Syncer CLI",
		);
	});

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

	it("uses a custom commit message when provided", async () => {
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

		await handler(buildParams({ message: "Custom delete" }, ["force"]));
		expect(deleteBatch).toHaveBeenCalledWith(["old.md"], "Custom delete");
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
