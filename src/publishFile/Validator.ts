import { FrontMatterCache, Notice } from "obsidian";

/**
 * Checks if the given flag exists in the front matter.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to check against.
 * @param override - Whether to override the check (default: false).
 * @returns true if the flag exists, false otherwise.
 */
export const hasPublishFlag = (
	flag: string,
	frontMatter?: FrontMatterCache,
	override = false,
): boolean => !!frontMatter?.[flag] || override;

/**
 * Validates if the publish front matter is set correctly.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to validate.
 * @param override - Whether to override the check (default: false).
 * @returns true if the front matter is valid, false otherwise.
 * @throws Notice if the front matter is not valid.
 */
export function isPublishFrontmatterValid(
	flag: string,
	frontMatter?: FrontMatterCache,
	override = false,
): boolean {
	if (!hasPublishFlag(flag, frontMatter, override)) {
		new Notice(
			"Quartz Syncer: Note does not have the publish: true set. Please add this and try again.",
		);

		return false;
	}

	return true;
}
