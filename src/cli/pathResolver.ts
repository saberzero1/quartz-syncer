import { App, TFile, normalizePath, prepareFuzzySearch } from "obsidian";
import { minimatch } from "minimatch";

export interface ResolvedFiles {
	files: TFile[];
	mode: "exact" | "glob" | "fuzzy";
	pattern: string;
}

/**
 * Resolve a path pattern to matching vault files.
 *
 * - Exact: "notes/my-post.md" // single file lookup
 * - Glob:  "notes/**\/*.md"   // minimatch against all files (detected by * or ? in path)
 * - Fuzzy: "~my post"         // Obsidian fuzzy search (detected by ~ prefix)
 */
export function resolvePathPattern(app: App, pattern: string): ResolvedFiles {
	if (pattern.startsWith("~")) {
		const query = pattern.slice(1).trim();
		const search = prepareFuzzySearch(query);

		const files = app.vault
			.getFiles()
			.map((f) => ({ file: f, result: search(f.path) }))
			.filter((r) => r.result !== null)
			.sort((a, b) => b.result!.score - a.result!.score)
			.map((r) => r.file);

		return { files, mode: "fuzzy", pattern: query };
	}

	if (pattern.includes("*") || pattern.includes("?")) {
		const normalizedGlob = pattern.replace(/\\/g, "/");

		const files = app.vault
			.getFiles()
			.filter((f) => minimatch(f.path, normalizedGlob));

		return { files, mode: "glob", pattern: normalizedGlob };
	}

	const normalized = normalizePath(pattern);
	const file = app.vault.getFileByPath(normalized);

	return {
		files: file ? [file] : [],
		mode: "exact",
		pattern: normalized,
	};
}
