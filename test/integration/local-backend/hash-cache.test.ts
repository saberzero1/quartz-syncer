import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { stat, unlink, utimes, writeFile } from "node:fs/promises";
import { Platform } from "obsidian";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
import * as externalFs from "src/utils/external-fs";
import * as utils from "src/utils/utils";
import { createTempRepo, cleanupTempRepo } from "./helpers";
import { createHashCacheDatabase } from "./hash-cache-idb";

const originalTime = new Date("2024-01-01T00:00:00Z");
const paths = Array.from({ length: 50 }, (_, i) => `file-${i}.bin`);
let repo: string;
let backend: LocalPublishBackend;
let database: ReturnType<typeof createHashCacheDatabase>;

beforeEach(async () => {
	Platform.isDesktopApp = true;
	vi.stubGlobal("window", globalThis);
	vi.stubGlobal("require", createRequire(import.meta.url));
	database = createHashCacheDatabase();
	vi.stubGlobal("indexedDB", database);
	repo = await createTempRepo();
	await Promise.all(
		paths.map(async (path) => {
			await writeFile(join(repo, path), "original");
			await utimes(join(repo, path), originalTime, originalTime);
		}),
	);
	backend = new LocalPublishBackend(repo);
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await cleanupTempRepo(repo);
});

describe("Persistent local tree hashes", () => {
	it.each([false, true])(
		"avoids all reads and hashes after dropping memory (new instance: %s)",
		async (restart) => {
			// Given
			const first = await backend.getCachedTree("main");
			backend.invalidateTreeCache();
			const reads = vi.spyOn(externalFs, "readBinaryExternalFile");
			const hashes = vi.spyOn(utils, "generateBlobHash");
			// When
			const tree = await (
				restart ? new LocalPublishBackend(repo) : backend
			).getCachedTree("main");
			// Then
			expect(tree).toHaveLength(50);
			expect(tree).toEqual(first);
			expect(reads).not.toHaveBeenCalled();
			expect(hashes).not.toHaveBeenCalled();
		},
	);

	it.each(["content and mtime", "size only", "mtime only"])(
		"rehashes exactly one file when changing %s",
		async (change) => {
			// Given
			const first = await backend.getTree("main");
			const file = join(repo, "file-0.bin");
			if (change !== "mtime only") await writeFile(file, "replacement");
			const time =
				change === "size only"
					? originalTime
					: new Date("2024-01-02T00:00:00Z");
			await utimes(file, time, time);
			const reads = vi.spyOn(externalFs, "readBinaryExternalFile");
			const hashes = vi.spyOn(utils, "generateBlobHash");
			// When
			const tree = await backend.refreshTreeCache();
			// Then
			expect(reads).toHaveBeenCalledTimes(1);
			expect(hashes).toHaveBeenCalledTimes(1);
			expect(tree.filter((e) => e.path !== "file-0.bin")).toEqual(
				first.filter((e) => e.path !== "file-0.bin"),
			);
			expect(
				tree.find((e) => e.path === "file-0.bin")?.sha ===
					first.find((e) => e.path === "file-0.bin")?.sha,
			).toBe(change === "mtime only");
		},
	);

	it("deliberately reuses the SHA when different bytes retain both size and mtime", async () => {
		// Given
		const first = await backend.getTree("main");
		const file = join(repo, "file-0.bin");
		await writeFile(file, "modified");
		await utimes(file, originalTime, originalTime);
		expect((await stat(file)).size).toBe(8);
		expect((await stat(file)).mtimeMs).toBe(originalTime.getTime());
		const reads = vi.spyOn(externalFs, "readBinaryExternalFile");
		const hashes = vi.spyOn(utils, "generateBlobHash");
		// When
		const tree = await backend.refreshTreeCache();
		// Then: metadata-only caching cannot detect this collision.
		expect(tree).toEqual(first);
		expect(reads).not.toHaveBeenCalled();
		expect(hashes).not.toHaveBeenCalled();
	});

	it("evicts deleted files so recreation with matching metadata is hashed afresh", async () => {
		// Given
		await backend.getTree("main");
		await unlink(join(repo, "file-0.bin"));
		// When
		const tree = await backend.refreshTreeCache();
		// Then
		expect(tree).toHaveLength(49);
		expect(tree.some((e) => e.path === "file-0.bin")).toBe(false);
		const snapshots = [...database.databases.values()].flatMap((values) => [
			...values.values(),
		]);
		expect(JSON.stringify(snapshots)).not.toContain('"file-0.bin"');
	});

	it("does not resurrect an evicted SHA when a deleted file is recreated", async () => {
		// Given
		const first = await backend.getTree("main");
		await unlink(join(repo, "file-0.bin"));
		await backend.refreshTreeCache();
		await writeFile(join(repo, "file-0.bin"), "modified");
		await utimes(join(repo, "file-0.bin"), originalTime, originalTime);
		const hashes = vi.spyOn(utils, "generateBlobHash");
		// When
		const tree = await new LocalPublishBackend(repo).getTree("main");
		// Then
		expect(hashes).toHaveBeenCalledTimes(1);
		expect(tree.find((e) => e.path === "file-0.bin")?.sha).not.toBe(
			first.find((e) => e.path === "file-0.bin")?.sha,
		);
	});

	it.each(["corrupt", "unavailable"])(
		"rehashes the full tree when the cache is %s",
		async (failure) => {
			// Given
			const first = await backend.getTree("main");
			if (failure === "corrupt") {
				for (const values of database.databases.values()) {
					for (const key of values.keys())
						values.set(key, [
							{
								path: "file-0.bin",
								size: 8,
								mtime: originalTime.getTime(),
								sha: "invalid",
							},
						]);
				}
			} else {
				vi.stubGlobal("indexedDB", {
					open() {
						throw new Error("Unavailable");
					},
				});
			}
			const reads = vi.spyOn(externalFs, "readBinaryExternalFile");
			const hashes = vi.spyOn(utils, "generateBlobHash");
			// When
			const tree = await new LocalPublishBackend(repo).getTree("main");
			// Then
			expect(tree).toEqual(first);
			expect(reads).toHaveBeenCalledTimes(50);
			expect(hashes).toHaveBeenCalledTimes(50);
		},
	);

	it("isolates repositories with identical relative paths and metadata", async () => {
		// Given
		await backend.getTree("main");
		const other = await createTempRepo();
		try {
			await writeFile(join(other, "file-0.bin"), "modified");
			await utimes(join(other, "file-0.bin"), originalTime, originalTime);
			const reads = vi.spyOn(externalFs, "readBinaryExternalFile");
			// When
			const tree = await new LocalPublishBackend(other).getTree("main");
			// Then
			expect(reads).toHaveBeenCalledTimes(1);
			expect(tree[0]?.sha).toBe(
				createHash("sha1").update("blob 8\0modified").digest("hex"),
			);
		} finally {
			await cleanupTempRepo(other);
		}
	});

	it("bounds cold reads to five concurrent files", async () => {
		// Given
		const fs =
			externalFs.getModule<typeof import("fs/promises")>("fs/promises");
		const stats = vi.spyOn(fs, "stat");
		const read = externalFs.readBinaryExternalFile;
		let active = 0;
		let peak = 0;
		vi.spyOn(externalFs, "readBinaryExternalFile").mockImplementation(
			async (path) => {
				active++;
				peak = Math.max(peak, active);
				try {
					return await read(path);
				} finally {
					active--;
				}
			},
		);
		// When
		await backend.getTree("main");
		// Then
		expect(peak).toBe(5);
		expect(stats).toHaveBeenCalledTimes(50);
	});
});
