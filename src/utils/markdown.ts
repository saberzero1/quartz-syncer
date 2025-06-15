/**
 * Utility functions for handling Markdown headings.
 *
 * @deprecated Unused.
 *
 * @param rawHeading - The raw Markdown heading string.
 * @returns An object containing the hashes and the title of the heading.
 */
const seperateHashesFromHeader = (
	rawHeading: string,
): { hashes: string; title: string } => {
	const regex = /^(?<hashes>#+)(?<space>\s?)(?<title>.*)$/;
	const matches = rawHeading.match(regex);

	if (matches?.groups) {
		const hashes = matches.groups["hashes"];
		const title = matches.groups["title"];

		return {
			hashes,
			title,
		};
	}

	// always return one hash for valid md heading
	return { hashes: "#", title: rawHeading.trim() };
};

/**
 * Fixes the Markdown header syntax by ensuring there is a space between the hashes and the title.
 *
 * @deprecated Unused.
 *
 * @param rawHeading - The raw Markdown heading string.
 * @returns The fixed Markdown heading string with proper syntax.
 */
export const fixMarkdownHeaderSyntax = (rawHeading: string): string => {
	const { hashes, title } = seperateHashesFromHeader(rawHeading);

	return `${hashes} ${title}`;
};
