import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as nodePath from "node:path";
import { createHash } from "node:crypto";
import { Platform } from "obsidian";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";

const files = new Map<string, Uint8Array>();

function childrenOf(dir: string): Map<string, "dir" | "file"> {
	const prefix = dir.endsWith("/") ? dir : `${dir}/`;
	const names = new Map<string, "dir" | "file">();

	for (const stored of files.keys()) {
		if (!stored.startsWith(prefix)) continue;
		const rest = stored.slice(prefix.length);
		const slash = rest.indexOf("/");

		if (slash === -1) {
			names.set(rest, "file");
		} else {
			names.set(rest.slice(0, slash), "dir");
		}
	}

	return names;
}

const fsPromisesStub = {
	writeFile: async (
		target: string,
		data: string | Uint8Array,
		options?: { encoding: string },
	) => {
		files.set(
			target,
			options?.encoding
				? new TextEncoder().encode(String(data))
				: new Uint8Array(data as Uint8Array),
		);
	},
	readFile: async (target: string, options?: { encoding: string }) => {
		const stored = files.get(target);

		if (!stored) throw new Error(`ENOENT: ${target}`);

		return options?.encoding
			? new TextDecoder().decode(stored)
			: Buffer.from(stored);
	},
	unlink: async (target: string) => {
		if (!files.delete(target)) throw new Error(`ENOENT: ${target}`);
	},
	mkdir: async () => undefined,
	readdir: async (target: string) => {
		const names = childrenOf(target);

		if (names.size === 0) throw new Error(`ENOENT: ${target}`);

		return [...names].map(([name, kind]) => ({
			name,
			isDirectory: () => kind === "dir",
			isFile: () => kind === "file",
			isSymbolicLink: () => false,
		}));
	},
	stat: async (target: string) => ({
		isDirectory: () => childrenOf(target).size > 0,
		isFile: () => files.has(target),
	}),
};

function gitBlobSha(bytes: Uint8Array): string {
	return createHash("sha1")
		.update(Buffer.from(`blob ${bytes.byteLength}\0`))
		.update(Buffer.from(bytes))
		.digest("hex");
}

beforeEach(() => {
	files.clear();
	Platform.isDesktopApp = true;
	(window as Window & { require?: (module: string) => unknown }).require = (
		module: string,
	) => {
		if (module === "path") return nodePath;
		if (module === "os") return { homedir: () => "/home/testuser" };
		if (module === "fs/promises") return fsPromisesStub;
		if (module === "buffer") return { Buffer };
		throw new Error(`Unknown module: ${module}`);
	};
});

afterEach(() => {
	Platform.isDesktopApp = true;
});

describe("LocalPublishBackend repo path handling", () => {
	it("writes through a tilde repo path", async () => {
		const backend = new LocalPublishBackend("~/quartz");
		const result = await backend.writeFiles("main", "msg", [
			{ path: "content/note.md", content: "Tilde" },
		]);

		expect(result).toEqual({ sha: "local" });
		expect(files.has("/home/testuser/quartz/content/note.md")).toBe(true);
	});

	it("writes through a repo path with a trailing separator", async () => {
		const backend = new LocalPublishBackend("/repo/");
		await backend.writeFiles("main", "msg", [
			{ path: "content/note.md", content: "Trailing" },
		]);

		expect(files.has("/repo/content/note.md")).toBe(true);
	});

	it("does not touch Node modules when constructed", () => {
		(window as Window & { require?: (module: string) => unknown }).require =
			() => {
				throw new Error("Node modules unavailable");
			};

		expect(() => new LocalPublishBackend("~/quartz")).not.toThrow();
	});

	it("rejects traversal and absolute targets", async () => {
		const backend = new LocalPublishBackend("/repo");

		await expect(
			backend.writeFiles("main", "msg", [
				{ path: "../escape.md", content: "no" },
			]),
		).rejects.toThrow("Path traversal rejected");

		await expect(
			backend.writeFiles("main", "msg", [
				{ path: "/etc/passwd", content: "no" },
			]),
		).rejects.toThrow("Path escapes repository");
	});

	it("reports a clear error off desktop", async () => {
		const backend = new LocalPublishBackend("/repo");
		Platform.isDesktopApp = false;

		await expect(
			backend.writeFiles("main", "msg", [
				{ path: "content/note.md", content: "no" },
			]),
		).rejects.toThrow("Local publishing requires a desktop app");
	});

	it("deletes a published file", async () => {
		const backend = new LocalPublishBackend("/repo");
		await backend.writeFiles("main", "msg", [
			{ path: "content/note.md", content: "Bye" },
		]);

		await backend.deleteFiles("main", "msg", ["content/note.md"]);

		expect(files.has("/repo/content/note.md")).toBe(false);
	});

	it("throws when deleting a missing file", async () => {
		const backend = new LocalPublishBackend("/repo");

		await expect(
			backend.deleteFiles("main", "msg", ["content/gone.md"]),
		).rejects.toThrow("Failed to delete file");
	});
});

describe("LocalPublishBackend tree", () => {
	it("omits dependency and build directories", async () => {
		files.set("/repo/content/note.md", new TextEncoder().encode("Note"));
		files.set("/repo/node_modules/pkg/index.js", new Uint8Array([1]));
		files.set("/repo/.git/config", new Uint8Array([2]));
		files.set("/repo/public/index.html", new Uint8Array([3]));
		files.set("/repo/.quartz-cache/blob", new Uint8Array([4]));

		const backend = new LocalPublishBackend("/repo");
		const tree = await backend.getTree("main");

		expect(tree.map((entry) => entry.path)).toEqual(["content/note.md"]);
	});

	it("hashes binary content from its bytes", async () => {
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
		files.set("/repo/content/image.png", bytes);

		const backend = new LocalPublishBackend("/repo");
		const tree = await backend.getTree("main");

		expect(tree[0]?.sha).toBe(gitBlobSha(bytes));
	});

	it("reuses the cached tree until invalidated", async () => {
		files.set("/repo/content/note.md", new TextEncoder().encode("Note"));
		const backend = new LocalPublishBackend("/repo");

		const first = await backend.getCachedTree("main");
		expect(await backend.getCachedTree("main")).toBe(first);

		backend.invalidateTreeCache();
		expect(await backend.getCachedTree("main")).not.toBe(first);
	});

	it("returns an empty tree when the repo is unreadable", async () => {
		const backend = new LocalPublishBackend("/missing");

		expect(await backend.getTree("main")).toEqual([]);
	});

	it("reads a blob and throws when it is missing", async () => {
		files.set("/repo/content/note.md", new TextEncoder().encode("Note"));
		const backend = new LocalPublishBackend("/repo");

		expect(await backend.readBlob("content/note.md")).toEqual(
			new TextEncoder().encode("Note"),
		);
		await expect(backend.readBlob("content/gone.md")).rejects.toThrow(
			"Failed to read file",
		);
	});
});
