import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep, win32 } from "node:path";
import { Platform } from "obsidian";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { createTempRepo, cleanupTempRepo } from "./helpers";

const requireFn = createRequire(import.meta.url);

type GlobalWithRequire = typeof globalThis & {
	require?: (module: string) => unknown;
	window?: unknown;
};

beforeEach(() => {
	Platform.isDesktopApp = true;
	const globalWindow = globalThis as GlobalWithRequire;

	if (!globalWindow.window) {
		globalWindow.window = globalWindow;
	}
	globalWindow.require = requireFn;
});

function gitBlobSha(bytes: Uint8Array): string {
	return createHash("sha1")
		.update(Buffer.from(`blob ${bytes.byteLength}\0`))
		.update(Buffer.from(bytes))
		.digest("hex");
}

describe("Local backend repository path forms", () => {
	it("publishes to a repo path containing a leading tilde", async () => {
		const repoPath = await mkdtemp(join(homedir(), "quartz-syncer-tilde-"));
		const tildePath = `~${sep}${relative(homedir(), repoPath)}`;
		try {
			const backend = new LocalPublishBackend(tildePath);
			const result = await backend.writeFiles("main", "msg", [
				{ path: "content/note.md", content: "Tilde" },
			]);

			expect(result).toEqual({ sha: "local" });
			expect(
				await readFile(join(repoPath, "content/note.md"), "utf-8"),
			).toBe("Tilde");

			const tree = await backend.getTree("main");
			expect(tree.map((entry) => entry.path)).toEqual([
				"content/note.md",
			]);
		} finally {
			await rm(repoPath, { recursive: true, force: true });
		}
	});

	it("publishes to a relative repo path", async () => {
		const repoPath = await createTempRepo();
		const relativePath = relative(process.cwd(), repoPath);
		try {
			const backend = new LocalPublishBackend(relativePath);
			await backend.writeFiles("main", "msg", [
				{ path: "content/note.md", content: "Relative" },
			]);

			expect(
				await readFile(join(repoPath, "content/note.md"), "utf-8"),
			).toBe("Relative");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("publishes to a repo path with a trailing separator", async () => {
		const repoPath = await createTempRepo();
		try {
			const backend = new LocalPublishBackend(`${repoPath}${sep}`);
			await backend.writeFiles("main", "msg", [
				{ path: "content/note.md", content: "Trailing" },
			]);

			expect(
				await readFile(join(repoPath, "content/note.md"), "utf-8"),
			).toBe("Trailing");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("reads through LocalFileSource with a tilde repo path", async () => {
		const repoPath = await mkdtemp(join(homedir(), "quartz-syncer-tilde-"));
		const tildePath = `~${sep}${relative(homedir(), repoPath)}`;
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(
				join(repoPath, "content/note.md"),
				"Source",
				"utf-8",
			);

			const source = new LocalFileSource(tildePath);
			expect(await source.readFile("content/note.md")).toBe("Source");
			expect(await source.exists("content/note.md")).toBe(true);
		} finally {
			await rm(repoPath, { recursive: true, force: true });
		}
	});

	it("still rejects traversal when the repo path is relative", async () => {
		const repoPath = await createTempRepo();
		const relativePath = relative(process.cwd(), repoPath);
		try {
			const backend = new LocalPublishBackend(relativePath);
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "../escape.txt", content: "escaped" },
				]),
			).rejects.toThrow("Path traversal rejected");
			await expect(
				backend.writeFiles("main", "msg", [
					{ path: "/tmp/absolute.txt", content: "absolute" },
				]),
			).rejects.toThrow("Path escapes repository");
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});
});

describe("Local backend tree construction", () => {
	it("omits build and dependency directories from the tree", async () => {
		const repoPath = await createTempRepo();
		try {
			for (const dir of [
				"node_modules/pkg",
				".git/objects",
				"public/assets",
				".quartz-cache",
			]) {
				await mkdir(join(repoPath, dir), { recursive: true });
				await writeFile(
					join(repoPath, dir, "junk.md"),
					"junk",
					"utf-8",
				);
			}
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(join(repoPath, "content/note.md"), "Note", "utf-8");

			const backend = new LocalPublishBackend(repoPath);
			const tree = await backend.getTree("main");

			expect(tree.map((entry) => entry.path)).toEqual([
				"content/note.md",
			]);
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("hashes binary files from their bytes", async () => {
		const repoPath = await createTempRepo();
		// Invalid UTF-8: decoding to a string replaces these with U+FFFD, which
		// is what produced unstable media hashes.
		const bytes = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00,
		]);
		try {
			await mkdir(join(repoPath, "content"), { recursive: true });
			await writeFile(
				join(repoPath, "content/image.png"),
				Buffer.from(bytes),
			);

			const backend = new LocalPublishBackend(repoPath);
			const tree = await backend.getTree("main");

			expect(tree[0]?.path).toBe("content/image.png");
			expect(tree[0]?.sha).toBe(gitBlobSha(bytes));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});

	it("keeps a stable hash for a published binary across rebuilds", async () => {
		const repoPath = await createTempRepo();
		const bytes = new Uint8Array([0x00, 0xc3, 0x28, 0xa0, 0xa1]);
		try {
			const backend = new LocalPublishBackend(repoPath);
			await backend.writeFiles("main", "msg", [
				{
					path: "content/blob.bin",
					content: Buffer.from(bytes).toString("base64"),
					encoding: "base64",
				},
			]);

			const tree = await backend.refreshTreeCache();
			expect(tree[0]?.sha).toBe(gitBlobSha(bytes));
		} finally {
			await cleanupTempRepo(repoPath);
		}
	});
});

describe("Windows path semantics", () => {
	let originalRequire: ((module: string) => unknown) | undefined;

	beforeEach(() => {
		const globalWindow = globalThis as GlobalWithRequire;
		originalRequire = globalWindow.require;
	});

	afterEach(() => {
		const globalWindow = globalThis as GlobalWithRequire;
		globalWindow.require = originalRequire;
	});

	async function loadWin32ExternalFs() {
		const { vi } = await import("vitest");
		vi.resetModules();

		const globalWindow = globalThis as GlobalWithRequire;
		globalWindow.require = (module: string) => {
			if (module === "path") return win32;
			if (module === "os") return { homedir: () => "C:\\Users\\me" };

			return requireFn(module);
		};

		const obsidian = await import("obsidian");
		obsidian.Platform.isDesktopApp = true;

		return import("src/utils/external-fs");
	}

	it("accepts every absolute Windows repo path form", async () => {
		const { resolveWithin } = await loadWin32ExternalFs();
		const expected = "C:\\Users\\me\\quartz\\content\\note.md";

		for (const base of [
			"C:\\Users\\me\\quartz",
			"C:/Users/me/quartz",
			"C:\\Users\\me\\quartz\\",
			"C:\\Users\\me/quartz",
		]) {
			expect(resolveWithin(base, "content/note.md")).toBe(expected);
		}
	});

	it("expands a tilde repo path into a Windows home directory", async () => {
		const { resolveWithin, resolveExternalPath } =
			await loadWin32ExternalFs();

		expect(resolveExternalPath("~/quartz")).toBe("C:\\Users\\me\\quartz");
		expect(resolveWithin("~/quartz", "content/note.md")).toBe(
			"C:\\Users\\me\\quartz\\content\\note.md",
		);
	});

	it("rejects escapes on Windows", async () => {
		const { resolveWithin } = await loadWin32ExternalFs();
		const base = "C:\\Users\\me\\quartz";

		for (const candidate of [
			"..\\..\\evil.md",
			"../../evil.md",
			"C:\\evil.md",
			"content\\..\\..\\out.md",
			"",
		]) {
			expect(resolveWithin(base, candidate)).toBeNull();
		}
	});

	it("allows a Windows subdirectory that shares a prefix with the repo", async () => {
		const { resolveWithin } = await loadWin32ExternalFs();

		expect(resolveWithin("C:\\repo", "content/note.md")).toBe(
			"C:\\repo\\content\\note.md",
		);
		expect(resolveWithin("C:\\repo2", "content/note.md")).toBe(
			"C:\\repo2\\content\\note.md",
		);
	});
});
