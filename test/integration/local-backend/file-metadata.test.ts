import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { Platform } from "obsidian";
import { getModule } from "src/utils/external-fs";
import { walkExternalFileMetadata } from "src/utils/external-file-metadata";
import { createTempRepo, cleanupTempRepo } from "./helpers";

let repo: string;
beforeEach(async () => {
	Platform.isDesktopApp = true;
	vi.stubGlobal("window", globalThis);
	vi.stubGlobal("require", createRequire(import.meta.url));
	repo = await createTempRepo();
});
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Platform.isDesktopApp = true;
	await cleanupTempRepo(repo);
});

it("stats files and file symlinks once without traversing ignored directories or directory symlinks", async () => {
	// Given
	await mkdir(join(repo, "node_modules"));
	await writeFile(join(repo, "node_modules", "ignored"), "skip");
	await writeFile(join(repo, "note.md"), "note");
	await symlink(join(repo, "note.md"), join(repo, "file-link"));
	await symlink(repo, join(repo, "cycle"));
	await symlink(join(repo, "missing"), join(repo, "broken"));
	const fs = getModule<typeof import("fs/promises")>("fs/promises");
	const stats = vi.spyOn(fs, "stat");
	// When
	const entries = await walkExternalFileMetadata(
		repo,
		new Set(["node_modules"]),
	);
	// Then
	expect(entries?.map((entry) => entry.path).sort()).toEqual([
		"file-link",
		"note.md",
	]);
	expect(
		entries?.every(
			(entry) => entry.size === 4 && typeof entry.mtime === "number",
		),
	).toBe(true);
	expect(stats.mock.calls.map(([path]) => path).sort()).toEqual(
		["broken", "cycle", "file-link", "note.md"].map((path) =>
			join(repo, path),
		),
	);
});

it("retains a regular file without cacheable metadata when stat fails", async () => {
	// Given
	await writeFile(join(repo, "note.md"), "note");
	const fs = getModule<typeof import("fs/promises")>("fs/promises");
	vi.spyOn(fs, "stat").mockRejectedValue(new Error("Permission denied"));
	// When
	const entries = await walkExternalFileMetadata(repo, new Set());
	// Then
	expect(entries).toEqual([{ path: "note.md", size: null, mtime: null }]);
});

it("returns null without accessing Node modules off desktop", async () => {
	// Given
	Platform.isDesktopApp = false;
	const requireFn = vi.fn(() => {
		throw new Error("Unavailable");
	});
	vi.stubGlobal("require", requireFn);
	// When
	const entries = await walkExternalFileMetadata(repo, new Set());
	// Then
	expect(entries).toBeNull();
	expect(requireFn).not.toHaveBeenCalled();
});
