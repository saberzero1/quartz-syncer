import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { Platform } from "obsidian";
import { LocalFileSource } from "src/quartz/LocalFileSource";
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

describe("LocalFileSource", () => {
	it("reads an existing file", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "notes"), { recursive: true });
			await writeFile(join(repoPath, "notes/read.md"), "Read", "utf-8");
			const source = new LocalFileSource(repoPath);
			const content = await source.readFile("notes/read.md");
			expect(content).toBe("Read");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns null for missing files", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			const content = await source.readFile("notes/missing.md");
			expect(content).toBeNull();
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("writes a new file", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await source.writeFile("notes/write.md", "Write");
			const stored = await readFile(
				join(repoPath, "notes/write.md"),
				"utf-8",
			);
			expect(stored).toBe("Write");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("creates parent directories when writing nested files", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await source.writeFile("content/sub/dir/note.md", "Nested");
			const stored = await readFile(
				join(repoPath, "content/sub/dir/note.md"),
				"utf-8",
			);
			expect(stored).toBe("Nested");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("writes binary data", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			const payload = new Uint8Array([5, 6, 7]);
			await source.writeBinaryFile("assets/blob.bin", payload);
			const stored = await readFile(join(repoPath, "assets/blob.bin"));
			expect(Array.from(stored)).toEqual(Array.from(payload));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("deletes existing files", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "notes"), { recursive: true });
			await writeFile(join(repoPath, "notes/delete.md"), "Delete");
			const source = new LocalFileSource(repoPath);
			await source.deleteFile("notes/delete.md");
			await expect(
				stat(join(repoPath, "notes/delete.md")),
			).rejects.toThrow();
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("throws when deleting missing files", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await expect(source.deleteFile("notes/missing.md")).rejects.toThrow(
				"Failed to delete file: notes/missing.md",
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("lists directory entries with types", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "content/subdir"), { recursive: true });
			await writeFile(join(repoPath, "content/file.md"), "File");
			const source = new LocalFileSource(repoPath);
			const entries = await source.listDirectory("content");
			const entryMap = new Map(
				entries.map((entry) => [entry.name, entry.type]),
			);
			expect(entryMap.get("file.md")).toBe("blob");
			expect(entryMap.get("subdir")).toBe("tree");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("lists all files recursively", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(join(repoPath, "content/one.md"), "One");
			await mkdir(join(repoPath, "content/sub"), { recursive: true });
			await writeFile(join(repoPath, "content/sub/two.md"), "Two");
			const source = new LocalFileSource(repoPath);
			const files = (await source.listAllFiles()).sort();
			expect(files).toEqual(
				["content/one.md", "content/sub/two.md"].sort(),
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("lists all files within a base path", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(join(repoPath, "content/one.md"), "One");
			await mkdir(join(repoPath, "other"), { recursive: true });
			await writeFile(join(repoPath, "other/two.md"), "Two");
			const source = new LocalFileSource(repoPath);
			const files = await source.listAllFiles("content");
			expect(files).toEqual(["content/one.md"]);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns true when files exist", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "notes"), { recursive: true });
			await writeFile(join(repoPath, "notes/exists.md"), "Exists");
			const source = new LocalFileSource(repoPath);
			expect(await source.exists("notes/exists.md")).toBe(true);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("returns false when files do not exist", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			expect(await source.exists("missing.md")).toBe(false);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});
});
