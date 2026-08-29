import { describe, expect, it, vi } from "vitest";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { TreeEntry } from "src/git/types";
import { PathMapper } from "src/git/PathMapper";
import { categorizeFiles } from "src/publisher/PublishStatusManager";
import type { DataStore } from "src/cache/DataStore";

const makeFile = (path: string): PublishFile =>
	({
		file: { path, stat: { mtime: 1000 } },
		getVaultPath: () => path,
	}) as PublishFile;

describe("PublishStatusManager", () => {
	it("categorizes published files when hashes match", async () => {
		const file = makeFile("notes/a.md");
		const cache = {
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
		} as unknown as DataStore;
		const remoteTree: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha-1", type: "blob" },
		];

		const status = await categorizeFiles(
			[file],
			remoteTree,
			cache,
			new PathMapper("content"),
		);

		expect(status.published).toEqual([file]);
		expect(status.changed).toEqual([]);
		expect(status.unpublished).toEqual([]);
	});

	it("categorizes changed files when hashes differ", async () => {
		const file = makeFile("notes/a.md");
		const cache = {
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
		} as unknown as DataStore;
		const remoteTree: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha-2", type: "blob" },
		];

		const status = await categorizeFiles(
			[file],
			remoteTree,
			cache,
			new PathMapper("content"),
		);

		expect(status.changed).toEqual([file]);
		expect(status.published).toEqual([]);
	});

	it("categorizes unpublished files when remote missing", async () => {
		const file = makeFile("notes/a.md");
		const cache = {
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
		} as unknown as DataStore;

		const status = await categorizeFiles(
			[file],
			[],
			cache,
			new PathMapper("content"),
		);

		expect(status.unpublished).toEqual([file]);
	});

	it("categorizes deleted files when remote has extra", async () => {
		const file = makeFile("notes/a.md");
		const cache = {
			loadLocalHash: vi.fn().mockResolvedValue("sha-1"),
		} as unknown as DataStore;
		const remoteTree: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha-1", type: "blob" },
			{ path: "content/notes/b.md", sha: "sha-2", type: "blob" },
		];

		const status = await categorizeFiles(
			[file],
			remoteTree,
			cache,
			new PathMapper("content"),
		);

		expect(status.deleted).toEqual(["notes/b.md"]);
	});
});
