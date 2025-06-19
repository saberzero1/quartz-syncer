import { FrontMatterCache, Notice } from "obsidian";

/**
 * Checks if the given flag exists in the front matter.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to check against.
 * @returns true if the flag exists, false otherwise.
 */
export const hasPublishFlag = (
	flag: string,
	frontMatter?: FrontMatterCache,
): boolean => !!frontMatter?.[flag];

/**
 * Validates if the publish front matter is set correctly.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to validate.
 * @returns true if the front matter is valid, false otherwise.
 * @throws Notice if the front matter is not valid.
 */
export function isPublishFrontmatterValid(
	flag: string,
	frontMatter?: FrontMatterCache,
): boolean {
	if (!hasPublishFlag(flag, frontMatter)) {
		new Notice(
			"Quartz Syncer: Note does not have the publish: true set. Please add this and try again.",
		);

		return false;
	}

	return true;
}
