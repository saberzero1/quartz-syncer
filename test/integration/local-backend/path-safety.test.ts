import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
	readFile,
	writeFile,
	symlink,
	realpath,
	mkdir,
} from "node:fs/promises";
import { Platform } from "obsidian";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
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

describe("Local backend path safety", () => {
	it("rejects ../ traversal in write paths", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "../escape.txt", content: "escaped" },
				]),
			).rejects.toThrow("Path traversal rejected");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects ../ traversal in delete paths", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.deleteFiles("main", "msg", ["../escape.txt"]),
			).rejects.toThrow("Path traversal rejected");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects absolute path writes", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "/tmp/absolute.txt", content: "absolute" },
				]),
			).rejects.toThrow("Path escapes repository");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects URL-encoded traversal containing literal dots", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "..%2F..%2Fetc%2Fpasswd", content: "encoded" },
				]),
			).rejects.toThrow("Path traversal rejected");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects ../ traversal in LocalFileSource", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await expect(source.readFile("../secret")).rejects.toThrow(
				"Path traversal rejected: ../secret",
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects absolute paths in LocalFileSource", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await expect(source.readFile("/etc/passwd")).rejects.toThrow(
				"Path escapes base directory: /etc/passwd",
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("allows safe filenames with double dots", async () => {
		const repoPath = await createTempRepo();
		const filePath = join("notes", "file..name.md");
		try {
			await mkdir(join(repoPath, "notes"), { recursive: true });
			await writeFile(join(repoPath, filePath), "safe", "utf-8");
			const source = new LocalFileSource(repoPath);
			const files = await source.listAllFiles();
			expect(files).toContain(filePath);
			expect(await source.exists(filePath)).toBe(true);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects ../ traversal in listDirectory", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await expect(source.listDirectory("../")).rejects.toThrow(
				"Path escapes base directory: ../",
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("rejects ../ traversal in listAllFiles", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			await expect(source.listAllFiles("../")).rejects.toThrow(
				"Path escapes base directory: ../",
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("reports an escaping path as absent in exists", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			expect(await source.exists("../../etc/passwd")).toBe(false);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("still lists every file when listAllFiles gets no argument", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(join(repoPath, "root.md"), "root", "utf-8");

			await writeFile(
				join(repoPath, "content", "nested.md"),
				"nested",
				"utf-8",
			);
			const source = new LocalFileSource(repoPath);
			const files = await source.listAllFiles();
			expect(files).toContain("root.md");
			expect(files).toContain(join("content", "nested.md"));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("treats an empty listAllFiles argument as the repository root", async () => {
		const repoPath = await createTempRepo();
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(join(repoPath, "root.md"), "root", "utf-8");

			await writeFile(
				join(repoPath, "content", "nested.md"),
				"nested",
				"utf-8",
			);
			const source = new LocalFileSource(repoPath);
			expect(await source.listAllFiles("")).toEqual(
				await source.listAllFiles(),
			);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("does not throw when exists is given an empty path", async () => {
		const repoPath = await createTempRepo();
		try {
			const source = new LocalFileSource(repoPath);
			expect(await source.exists("")).toBe(true);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("follows symlink escapes when writing", async () => {
		// SECURITY: LocalPublishBackend does not validate paths — traversal possible
		const repoPath = await createTempRepo();
		const outsideDir = await createTempRepo();
		try {
			await symlink(outsideDir, join(repoPath, "linked"));
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{ path: "linked/escape.md", content: "outside" },
			]);
			const stored = await readFile(
				join(outsideDir, "escape.md"),
				"utf-8",
			);
			const real = await realpath(join(repoPath, "linked/escape.md"));
			expect(stored).toBe("outside");
			expect(real.startsWith(outsideDir)).toBe(true);
		} finally {
			await cleanupTempRepo(repoPath);
			await cleanupTempRepo(outsideDir);
		}
	});

	it("throws on null bytes in paths", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(repoPath);
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "content/\0/evil.md", content: "bad" },
				]),
			).rejects.toThrow();
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});
});
