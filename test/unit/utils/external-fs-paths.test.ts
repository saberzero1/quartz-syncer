import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as nodePath from "node:path";
import * as nodeOs from "node:os";
import { Platform } from "obsidian";
import {
	resolveExternalPath,
	resolveWithin,
	walkExternalFiles,
} from "src/utils/external-fs";

type Entry = { name: string; kind: "dir" | "file" | "link" };

const directories: Record<string, Entry[]> = {
	"/repo": [
		{ name: "content", kind: "dir" },
		{ name: "node_modules", kind: "dir" },
		{ name: ".git", kind: "dir" },
		{ name: "readme.md", kind: "file" },
		{ name: "shortcut.md", kind: "link" },
		{ name: "linked-dir", kind: "link" },
	],
	"/repo/content": [{ name: "note.md", kind: "file" }],
	"/repo/node_modules": [{ name: "junk.js", kind: "file" }],
	"/repo/.git": [{ name: "config", kind: "file" }],
};

// Also accept windows-style paths in the mock
Object.entries(directories).forEach(([key, value]) => {
	const winKey = key.replace("/repo", "C:\\repo").replace(/\//g, "\\");
	directories[winKey] = value;
});

function toDirent(entry: Entry) {
	return {
		name: entry.name,
		isDirectory: () => entry.kind === "dir",
		isFile: () => entry.kind === "file",
		isSymbolicLink: () => entry.kind === "link",
	};
}

const fsPromisesStub = {
	readdir: async (target: string) => {
		const entries = directories[target];
		if (!entries) throw new Error(`ENOENT: ${target}`);

		return entries.map(toDirent);
	},
	stat: async (target: string) => ({
		isDirectory: () => target === "/repo/linked-dir" || target === "C:\\repo\\linked-dir",
		isFile: () => target !== "/repo/linked-dir" && target !== "C:\\repo\\linked-dir",
	}),
};

beforeEach(() => {
	Platform.isDesktopApp = true;
	(window as Window & { require?: (module: string) => unknown }).require = (
		module: string,
	) => {
		if (module === "path") return nodePath;
		if (module === "os") return { homedir: () => "/home/testuser" };
		if (module === "fs/promises") return fsPromisesStub;
		throw new Error(`Unknown module: ${module}`);
	};
});

afterEach(() => {
	Platform.isDesktopApp = true;
});

type ResolveExternalPathAnswers = {
	expandTilde: string;
	normalizeTrailingSeparator: string;
	absolutePath: string;
};

function getResolveExternalPathAnswers(): ResolveExternalPathAnswers {
	if (nodeOs.platform() === "win32") {
		return {
			expandTilde: "C:\\home\\testuser\\quartz",
			normalizeTrailingSeparator: "C:\\repo",
			absolutePath: "C:\\repo\\content",
		};
	}
	else {
		return {
			expandTilde: "/home/testuser/quartz",
			normalizeTrailingSeparator: "/repo",
			absolutePath: "/repo/content",
		};
	}
}

describe("resolveExternalPath", () => {
	const answers = getResolveExternalPathAnswers();
	it("expands a tilde into an absolute path", () => {
			expect(resolveExternalPath("~/quartz")).toBe(answers.expandTilde);
	});

	it("normalizes a trailing separator", () => {
		expect(resolveExternalPath("/repo/")).toBe(answers.normalizeTrailingSeparator);
	});

	it("leaves an absolute path unchanged", () => {
		expect(resolveExternalPath("/repo/content")).toBe(answers.absolutePath);
	});

	it("returns the input untouched on mobile", () => {
		Platform.isDesktopApp = false;
		expect(resolveExternalPath("~/quartz")).toBe("~/quartz");
	});
});

type ResolveWithinAnswers = {
	pathInsideBase: string;
	tildeBase: string;
	trailingSeparator: string;
	filenameDots: string;
}

function getResolveWithinAnswers(): ResolveWithinAnswers {
	if (nodeOs.platform() === "win32") {
		return {
			pathInsideBase: "C:\\repo\\content\\note.md",
			tildeBase: "C:\\home\\testuser\\quartz\\content\\note.md",
			trailingSeparator: "C:\\repo\\content\\note.md",
			filenameDots: "C:\\repo\\note..md",
		};
	}
	else {
		return {
			pathInsideBase: "/repo/content/note.md",
			tildeBase: "/home/testuser/quartz/content/note.md",
			trailingSeparator: "/repo/content/note.md",
			filenameDots: "/repo/note..md",
		};
	}
}

describe("resolveWithin", () => {
	const answers = getResolveWithinAnswers();
	it("resolves a path inside the base", () => {
		expect(resolveWithin("/repo", "content/note.md")).toBe(
			answers.pathInsideBase,
		);
	});

	it("resolves against a tilde base", () => {
		expect(resolveWithin("~/quartz", "content/note.md")).toBe(
			answers.tildeBase,
		);
	});

	it("resolves against a base with a trailing separator", () => {
		expect(resolveWithin("/repo/", "content/note.md")).toBe(
			answers.trailingSeparator,
		);
	});

	it("rejects traversal outside the base", () => {
		expect(resolveWithin("/repo", "../escape.md")).toBeNull();
		expect(resolveWithin("/repo", "content/../../escape.md")).toBeNull();
	});

	it("rejects an absolute target", () => {
		expect(resolveWithin("/repo", "/etc/passwd")).toBeNull();
	});

	it("rejects the base itself", () => {
		expect(resolveWithin("/repo", "")).toBeNull();
	});

	it("does not treat a sibling sharing a prefix as inside", () => {
		expect(resolveWithin("/repo", "../repo2/note.md")).toBeNull();
	});

	it("allows a filename that merely contains dots", () => {
		expect(resolveWithin("/repo", "note..md")).toBe(answers.filenameDots);
	});

	it("returns null on mobile", () => {
		Platform.isDesktopApp = false;
		expect(resolveWithin("/repo", "content/note.md")).toBeNull();
	});
});

describe("walkExternalFiles", () => {
	it("skips ignored directories and returns repo-relative files", async () => {
		const files = await walkExternalFiles(
			"/repo",
			new Set([".git", "node_modules"]),
		);

		expect(files).toEqual(["content/note.md", "readme.md", "shortcut.md"]);
	});

	it("descends into directories that are not ignored", async () => {
		const files = await walkExternalFiles("/repo", new Set());

		expect(files).toContain("node_modules/junk.js");
		expect(files).toContain(".git/config");
	});

	it("returns null when the directory cannot be read", async () => {
		expect(await walkExternalFiles("/missing", new Set())).toBeNull();
	});

	it("returns null on mobile", async () => {
		Platform.isDesktopApp = false;
		expect(await walkExternalFiles("/repo", new Set())).toBeNull();
	});
});
