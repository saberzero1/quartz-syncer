import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
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

	it("uses a custom commit message when provided", async () => {
		const fileA = { getVaultPath: () => "a.md" } as PublishFile;
		const publishBatch = vi.fn(async () => ({
			success: true,
			filesPublished: 1,
			commitSha: "abc123",
		}));
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: [fileA],
				changed: [],
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

		await handler(buildParams({ message: "Custom publish" }));
		expect(publishBatch).toHaveBeenCalledWith([fileA], "Custom publish");
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

	it("rejects arbitrary publishing when disabled", async () => {
		const publisher = {
			publishArbitraryFiles: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				allowArbitraryFilePublishing: false,
				arbitraryPublishPaths: ["notes/a.md"],
			},
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(buildParams({ action: "arbitrary" }));
		expect(result).toEqual({
			success: false,
			error: "Arbitrary file publishing is disabled. Enable it in settings.",
		});
	});

	it("requires force for arbitrary publishing", async () => {
		const publisher = {
			publishArbitraryFiles: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				allowArbitraryFilePublishing: true,
				arbitraryPublishPaths: ["notes/a.md"],
			},
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(buildParams({ action: "arbitrary" }));
		expect(result).toEqual({
			success: false,
			error: "Arbitrary file publishing requires the 'force' flag.",
		});
	});

	it("publishes arbitrary files when configured", async () => {
		const publishArbitraryFiles = vi.fn(async () => ({
			success: true,
			filesPublished: 1,
			commitSha: "arb123",
		}));
		const publisher = {
			publishArbitraryFiles,
		} as unknown as Publisher;
		const vault = {
			getFileByPath: vi.fn((path: string) => ({ path })),
			read: vi.fn(async () => "content"),
			readBinary: vi.fn(async () => new ArrayBuffer(0)),
		};
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				allowArbitraryFilePublishing: true,
				arbitraryPublishPaths: ["notes/a.md"],
			},
			app: { version: "1.6.0", vault } as unknown as App,
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(
			buildParams({ action: "arbitrary" }, ["force"]),
		);
		expect(publishArbitraryFiles).toHaveBeenCalledWith(
			[
				{
					repoPath: "notes/a.md",
					content: "content",
					encoding: "utf-8",
				},
			],
			"Published arbitrary files via Quartz Syncer CLI",
		);
		expect(result).toEqual({
			success: true,
			data: {
				filesPublished: 1,
				commitSha: "arb123",
			},
			error: undefined,
		});
	});

	it("returns paths on arbitrary dry-run", async () => {
		const publisher = {
			publishArbitraryFiles: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				allowArbitraryFilePublishing: true,
				arbitraryPublishPaths: ["notes/a.md"],
			},
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(
			buildParams({ action: "arbitrary" }, ["force", "dry-run"]),
		);
		expect(result).toEqual({
			success: true,
			data: { dryRun: true, paths: ["notes/a.md"] },
		});
	});

	it("requires configured paths for arbitrary publishing", async () => {
		const publisher = {
			publishArbitraryFiles: vi.fn(),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				allowArbitraryFilePublishing: true,
				arbitraryPublishPaths: [],
			},
			getPublisher: vi.fn(
				() => publisher,
			) as unknown as () => Publisher | null,
		});
		const handler = createPublishHandler(plugin);

		const result = await handler(
			buildParams({ action: "arbitrary" }, ["force"]),
		);
		expect(result).toEqual({
			success: false,
			error: "No arbitrary publish paths configured in settings.",
		});
	});
});
