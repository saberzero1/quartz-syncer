import { TFile } from "obsidian";
import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

export function createMarkHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const pathArg = params.args.path;
		if (!pathArg) {
			return { success: false, error: "Missing path parameter" };
		}
		const rawState =
			params.args.state ??
			(params.flags.has("toggle") ? "toggle" : undefined);
		const state = rawState?.toLowerCase();
		const isToggle = !state || state === "toggle";
		const trueStates = new Set([
			"true",
			"on",
			"yes",
			"1",
			"set",
			"publish",
		]);
		const falseStates = new Set(["false", "off", "no", "0", "unpublish"]);
		const unsetStates = new Set(["unset", "remove", "clear"]);

		if (
			state &&
			!isToggle &&
			!trueStates.has(state) &&
			!falseStates.has(state) &&
			!unsetStates.has(state)
		) {
			return { success: false, error: `Unknown state: ${rawState}` };
		}

		let matched: TFile[] = [];
		const isFuzzy = pathArg.startsWith("~");
		const isGlob = pathArg.includes("*");

		if (isFuzzy) {
			const query = pathArg.slice(1).trim();
			if (!query) {
				return { success: false, error: "Missing fuzzy search query" };
			}
			const normalizedQuery = normalizeFuzzy(query);
			matched = _plugin.app.vault
				.getMarkdownFiles()
				.filter((file) =>
					normalizeFuzzy(file.basename).includes(normalizedQuery),
				);
		} else if (isGlob) {
			const unsupported = /[?{}[\]!]/.test(pathArg);
			if (unsupported) {
				return {
					success: false,
					error: `Unsupported glob pattern: ${pathArg}`,
				};
			}
			matched = _plugin.app.vault
				.getMarkdownFiles()
				.filter((file) => matchGlob(pathArg, file.path));
		} else {
			const file = _plugin.app.vault.getFileByPath(pathArg);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `File not found: ${pathArg}` };
			}
			if (file.extension !== "md") {
				return {
					success: false,
					error: `File is not a markdown file: ${pathArg}`,
				};
			}
			matched = [file];
		}

		if (matched.length === 0) {
			return { success: false, error: `No files matched: ${pathArg}` };
		}

		const matchedPaths = matched.map((file) => file.path);
		const key = _plugin.settings.publishFrontmatterKey;
		const isDryRun = params.flags.has("dry-run");

		if (isDryRun) {
			return {
				success: true,
				data: {
					matched: matchedPaths,
					matchedCount: matchedPaths.length,
				},
			};
		}

		const modified: string[] = [];
		for (const file of matched) {
			const engine = new ObsidianFrontMatterEngine(
				_plugin.app.vault,
				_plugin.app.metadataCache,
				file,
				_plugin.app.fileManager,
			);
			const currentValue = Boolean(engine.get(key));

			if (isToggle) {
				engine.set(key, !currentValue);
			} else if (state && trueStates.has(state)) {
				engine.set(key, true);
			} else if (state && falseStates.has(state)) {
				engine.set(key, false);
			} else if (state && unsetStates.has(state)) {
				engine.remove(key);
			}

			await engine.apply();
			modified.push(file.path);
		}

		return {
			success: true,
			data: {
				matched: matchedPaths,
				matchedCount: matchedPaths.length,
				modified,
			},
		};
	};
}

function normalizeFuzzy(input: string): string {
	return input
		.toLowerCase()
		.replace(/\.md$/i, "")
		.replace(/[-\s]+/g, "");
}

function matchGlob(pattern: string, path: string): boolean {
	const normalizedPattern = pattern.replace(/\\/g, "/");
	const normalizedPath = path.replace(/\\/g, "/");
	const escaped = normalizedPattern.replace(/[.()+?^${}()|[\]\\]/g, "\\$&");
	const placeholder = "__DOUBLE_STAR__";
	const withDouble = escaped.replace(/\*\*/g, placeholder);
	const withSingle = withDouble.replace(/\*/g, "[^/]*");
	const regexSource =
		"^" + withSingle.replace(new RegExp(placeholder, "g"), ".*") + "$";
	return new RegExp(regexSource).test(normalizedPath);
}
