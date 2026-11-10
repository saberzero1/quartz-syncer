/**
 * Frontmatter keys that Quartz reads as the social preview image.
 * Mirrors the aliases accepted by `FrontmatterCompiler.addSocialImage`.
 */
export const FRONTMATTER_IMAGE_KEYS: ReadonlySet<string> = new Set([
	"socialImage",
	"image",
	"cover",
]);

const WIKILINK_VALUE_REGEX =
	/^!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/;

/**
 * Reports whether a metadata cache key (as found in
 * `CachedMetadata.frontmatterLinks`) targets a social image property.
 * Obsidian suffixes keys of list properties with an index (`image.0`).
 *
 * @param key - The frontmatter property key reported by the metadata cache.
 */
export function isFrontmatterImageKey(key: string): boolean {
	return FRONTMATTER_IMAGE_KEYS.has(key.split(".")[0] ?? key);
}

/**
 * Extracts the link target from a frontmatter value written as a wikilink,
 * e.g. `[[cover.jpg]]` or `[[cover.jpg|alt]]`.
 *
 * @param value - The raw frontmatter value.
 * @returns The link path, or null when the value is not a wikilink.
 */
export function parseFrontmatterWikilink(value: unknown): string | null {
	if (typeof value !== "string") return null;

	const match = WIKILINK_VALUE_REGEX.exec(value.trim());

	return match?.[1]?.trim() ?? null;
}
