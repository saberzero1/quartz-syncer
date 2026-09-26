import type QuartzSyncerSettings from "src/models/settings";

/** A publishing-policy failure must never be treated as a skippable note error. */
export class ExcludedFolderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExcludedFolderError";
	}
}

function normalizePath(path: string): string {
	const segments: string[] = [];
	for (const segment of path
		.replace(/\\/g, "/")
		.normalize("NFC")
		.split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") segments.pop();
		else segments.push(segment);
	}
	return segments.join("/").toLowerCase();
}

/** Literal vault-relative paths, one per line; never interpret globs or regexes. */
export function validateExcludedFolders(value: string): string | undefined {
	for (const line of value.split(/\r?\n/).map((entry) => entry.trim())) {
		if (!line) continue;
		if (
			!normalizePath(line) ||
			line.replace(/\\/g, "/").split("/").includes("..") ||
			/[*?[\]]/.test(line) ||
			[...line].some((character) => character.charCodeAt(0) < 32)
		) {
			return "Enter literal vault-relative folder paths, one per line, without parent traversal or wildcards.";
		}
	}
	return undefined;
}

export function excludedFolders(settings: QuartzSyncerSettings): string[] {
	const value = settings.excludedFolders ?? "";
	if (typeof value !== "string") {
		throw new ExcludedFolderError(
			"Excluded folders must be a newline-separated string.",
		);
	}
	const error = validateExcludedFolders(value);
	if (error) throw new ExcludedFolderError(error);
	return [
		...new Set(
			value
				.split(/\r?\n/)
				.map((line) => normalizePath(line.trim()))
				.filter(Boolean),
		),
	].sort();
}

export function hasExcludedFolders(settings: QuartzSyncerSettings): boolean {
	return excludedFolders(settings).length > 0;
}

/** Exclusions win over publication flags, special-file toggles and all-notes mode. */
export function isExcludedVaultPath(
	path: string,
	settings: QuartzSyncerSettings,
): boolean {
	const target = normalizePath(path);
	return excludedFolders(settings).some(
		(folder) => target === folder || target.startsWith(`${folder}/`),
	);
}

export function assertVaultPathAllowed(
	path: string,
	settings: QuartzSyncerSettings,
): void {
	if (isExcludedVaultPath(path, settings)) {
		throw new ExcludedFolderError(
			`Publishing blocked: "${path}" is in an excluded folder. Remove the excluded file or reference from this publish batch.`,
		);
	}
}
