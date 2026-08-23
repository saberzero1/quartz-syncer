import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { Platform } from "obsidian";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
import { createTempRepo, cleanupTempRepo } from "./helpers";

const requireFn = createRequire(import.meta.url);

beforeEach(() => {
	Platform.isDesktopApp = true;
	const globalWindow = globalThis as unknown as {
		require?: (module: string) => unknown;
		window?: unknown;
	};
	if (!globalWindow.window) {
		globalWindow.window = globalWindow;
	}
	globalWindow.require = requireFn;
});

describe("LocalPublishBackend", () => {
	it("writes a single text file", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/note.md", content: "Hello world" },
			]);
			const stored = await readFile(
				join(repoPath, "content/note.md"),
				"utf-8",
			);
			expect(stored).toBe("Hello world");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("writes a single binary file from base64", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			const payload = new Uint8Array([1, 2, 3, 4, 5]);
			const base64 = Buffer.from(payload).toString("base64");
			await backend.writeFiles("main", "msg", [
				{
					path: "content/blob.bin",
					content: base64,
					encoding: "base64",
				},
			]);
			const stored = await readFile(join(repoPath, "content/blob.bin"));
			expect(Array.from(stored)).toEqual(Array.from(payload));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("writes a single binary file from Uint8Array", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			const payload = new Uint8Array([9, 8, 7]);
			await backend.writeFiles("main", "msg", [
				{ path: "content/buffer.bin", content: payload },
			]);
			const stored = await readFile(join(repoPath, "content/buffer.bin"));
			expect(Array.from(stored)).toEqual(Array.from(payload));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("creates parent directories for nested files", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{
					path: "content/sub/dir/note.md",
					content: "Nested",
				},
			]);
			const stored = await readFile(
				join(repoPath, "content/sub/dir/note.md"),
				"utf-8",
			);
			expect(stored).toBe("Nested");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("writes multiple files in a batch", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/one.md", content: "One" },
				{ path: "content/two.md", content: "Two" },
				{ path: "assets/three.txt", content: "Three" },
			]);
			const storedOne = await readFile(
				join(repoPath, "content/one.md"),
				"utf-8",
			);
			const storedTwo = await readFile(
				join(repoPath, "content/two.md"),
				"utf-8",
			);
			const storedThree = await readFile(
				join(repoPath, "assets/three.txt"),
				"utf-8",
			);
			expect(storedOne).toBe("One");
			expect(storedTwo).toBe("Two");
			expect(storedThree).toBe("Three");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("overwrites existing files", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/overwrite.md", content: "First" },
			]);
			await backend.writeFiles("main", "msg", [
				{ path: "content/overwrite.md", content: "Second" },
			]);
			const stored = await readFile(
				join(repoPath, "content/overwrite.md"),
				"utf-8",
			);
			expect(stored).toBe("Second");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("deletes a single file", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/delete.md", content: "Delete" },
			]);
			await backend.deleteFiles("main", "msg", ["content/delete.md"]);
			await expect(
				stat(join(repoPath, "content/delete.md")),
			).rejects.toThrow();
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("deletes multiple files", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/a.md", content: "A" },
				{ path: "content/b.md", content: "B" },
				{ path: "content/c.md", content: "C" },
			]);
			await backend.deleteFiles("main", "msg", [
				"content/a.md",
				"content/c.md",
			]);
			await expect(
				stat(join(repoPath, "content/a.md")),
			).rejects.toThrow();
			await expect(
				stat(join(repoPath, "content/c.md")),
			).rejects.toThrow();
			const remaining = await readFile(
				join(repoPath, "content/b.md"),
				"utf-8",
			);
			expect(remaining).toBe("B");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("throws when deleting a nonexistent file", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.deleteFiles("main", "msg", ["missing.md"]),
			).rejects.toThrow("Failed to delete file: missing.md");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("round-trips binary content via readBlob", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			const bytes = new Uint8Array([11, 12, 13, 14]);
			const base64 = Buffer.from(bytes).toString("base64");
			await backend.writeFiles("main", "msg", [
				{
					path: "content/blob.dat",
					content: base64,
					encoding: "base64",
				},
			]);
			const blob = await backend.readBlob("content/blob.dat");
			expect(Array.from(blob)).toEqual(Array.from(bytes));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("invalidates cache on write", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			const before = await backend.getCachedTree("main");
			await backend.writeFiles("main", "msg", [
				{ path: "content/new.md", content: "New" },
			]);
			const after = await backend.getCachedTree("main");
			expect(before.length).toBe(0);
			expect(after.length).toBe(1);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("invalidates cache on delete", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/to-delete.md", content: "Gone" },
			]);
			const before = await backend.getCachedTree("main");
			await backend.deleteFiles("main", "msg", ["content/to-delete.md"]);
			const after = await backend.getCachedTree("main");
			expect(before.length).toBe(1);
			expect(after.length).toBe(0);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("builds a tree with all files", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/one.md", content: "One" },
				{ path: "content/two.md", content: "Two" },
				{ path: "content/three.md", content: "Three" },
			]);
			const tree = await backend.getTree("main");
			const paths = tree.map((entry) => entry.path).sort();
			expect(paths).toEqual(
				["content/one.md", "content/three.md", "content/two.md"].sort(),
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("excludes directories from the tree", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/subdir/file.md", content: "File" },
			]);
			const tree = await backend.getTree("main");
			expect(tree).toHaveLength(1);
			expect(tree[0]?.path).toBe("content/subdir/file.md");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns cached tree data", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/cache.md", content: "Cache" },
			]);
			const first = await backend.getCachedTree("main");
			const second = await backend.getCachedTree("main");
			expect(second).toBe(first);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("throws when reading a missing blob", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.readBlob("content/missing.bin"),
			).rejects.toThrow("Failed to read file: content/missing.bin");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns the local sha on writeFiles", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			const result = await backend.writeFiles("main", "msg", [
				{ path: "content/sha.md", content: "Sha" },
			]);
			expect(result).toEqual({ sha: "local" });
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns the local sha on deleteFiles", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/remove.md", content: "Remove" },
			]);
			const result = await backend.deleteFiles("main", "msg", [
				"content/remove.md",
			]);
			expect(result).toEqual({ sha: "local" });
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});
});
