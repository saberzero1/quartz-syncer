import { FrontMatterCache, stringifyYaml } from "obsidian";
import { sanitizePermalink } from "src/utils/utils";
import QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";

/**
 * TFrontmatter type.
 * This type represents the frontmatter of a file.
 */
export type TFrontmatter = Record<string, unknown> & {
	title?: string;
	description?: string;
	aliases?: string | string[];
	permalink?: string;
	draft?: boolean;
	tags?: string | string[];
};

/**
 * TPublishedFrontMatter type.
 * This type represents the frontmatter of a published file.
 * It extends the TFrontmatter type with additional properties.
 */
export type TPublishedFrontMatter = Record<string, unknown> & {
	title?: string;
	description?: string;
	aliases?: string[];
	permalink?: string;
	draft?: boolean;
	tags?: string[];
	cssclasses?: string[];
};

/**
 * FrontmatterCompiler class.
 * This class is responsible for compiling the frontmatter of a file.
 * It adds the permalink, default pass-throughs, timestamps, tags, CSS classes, and social image to the frontmatter.
 *
 * Documentation: {@link https://saberzero1.github.io/quartz-syncer-docs/Settings/Note-properties/}
 */
/**
 * Parse a frontmatter value that may be a comma-separated string or an array.
 * Returns a flat array of non-empty strings.
 *
 * @param value - The raw frontmatter value (string, string[], or unknown).
 * @param separator - The regex to split string values on (default: comma with optional whitespace).
 * @returns An array of non-empty strings.
 */
function parseStringOrArray(
	value: unknown,
	separator: RegExp = /,\s*/,
): string[] {
	if (typeof value === "string") {
		return value.split(separator).filter(Boolean);
	}

	if (Array.isArray(value)) {
		return value as string[];
	}

	return [];
}

export class FrontmatterCompiler {
	private readonly settings: QuartzSyncerSettings;

	constructor(settings: QuartzSyncerSettings) {
		this.settings = settings;
	}

	/**
	 * Compiles the frontmatter of a file.
	 * It adds the permalink, default pass-throughs, timestamps, tags, CSS classes, and social image to the frontmatter.
	 *
	 * @param file - The file to compile the frontmatter for.
	 * @param frontmatter - The frontmatter of the file.
	 * @returns The compiled frontmatter as a string.
	 */
	compile(file: PublishFile, frontmatter: FrontMatterCache): string {
		const fileFrontMatter = { ...frontmatter };
		delete fileFrontMatter["position"];

		let publishedFrontMatter: TPublishedFrontMatter = {
			publish: true,
		};

		publishedFrontMatter = this.addPermalink(file)(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addDefaultPassThrough(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addTimestampsFrontmatter(file)(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addTags(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addCSSClasses(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addSocialImage(
			fileFrontMatter,
			publishedFrontMatter,
		);

		const fullFrontMatter = this.settings.includeAllFrontmatter
			? { ...publishedFrontMatter, ...fileFrontMatter }
			: publishedFrontMatter;

		const frontMatterString =
			this.settings.frontmatterFormat === "json"
				? JSON.stringify(fullFrontMatter) + "\n"
				: stringifyYaml(fullFrontMatter);

		return `---\n${frontMatterString}---\n`;
	}

	private addPermalink =
		(file: PublishFile) =>
		(
			baseFrontMatter: TFrontmatter,
			newFrontMatter: TPublishedFrontMatter,
		) => {
			const publishedFrontMatter = { ...newFrontMatter };

			if (baseFrontMatter) {
				if (baseFrontMatter["permalink"]) {
					publishedFrontMatter["permalink"] =
						baseFrontMatter["permalink"];
				} else if (this.settings.usePermalink) {
					publishedFrontMatter["permalink"] = sanitizePermalink(
						baseFrontMatter["permalink"] ?? file.getVaultPath(),
					);
				}

				if (baseFrontMatter["aliases"] || baseFrontMatter["alias"]) {
					const aliases = [
						...parseStringOrArray(baseFrontMatter["aliases"]),
						...parseStringOrArray(baseFrontMatter["alias"]),
					];

					if (aliases.length > 0) {
						publishedFrontMatter["aliases"] = [...new Set(aliases)];
					}
				}
			}

			return publishedFrontMatter;
		};

	private addDefaultPassThrough(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		// Eventually we will add other pass-throughs here. e.g. tags.
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			if (baseFrontMatter["title"]) {
				publishedFrontMatter["title"] = baseFrontMatter["title"];
			}

			if (baseFrontMatter["description"]) {
				publishedFrontMatter["description"] =
					baseFrontMatter["description"];
			}

			if (baseFrontMatter["draft"]) {
				publishedFrontMatter["draft"] = baseFrontMatter["draft"];
			}

			if (baseFrontMatter["comments"]) {
				publishedFrontMatter["comments"] = baseFrontMatter["comments"];
			}

			if (baseFrontMatter["lang"]) {
				publishedFrontMatter["lang"] = baseFrontMatter["lang"];
			}

			if (baseFrontMatter["enableToc"]) {
				publishedFrontMatter["enableToc"] =
					baseFrontMatter["enableToc"];
			}
		}

		return publishedFrontMatter;
	}

	private addTags(
		fileFrontMatter: TFrontmatter,
		publishedFrontMatterWithoutTags: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...publishedFrontMatterWithoutTags };

		if (fileFrontMatter) {
			const tags = [
				...parseStringOrArray(fileFrontMatter["tags"]),
				...parseStringOrArray(fileFrontMatter["tag"]),
			];

			if (tags.length > 0) {
				publishedFrontMatter["tags"] = [...new Set(tags)];
			}
		}

		return publishedFrontMatter;
	}

	private addCSSClasses(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			const cssclasses = [
				...parseStringOrArray(baseFrontMatter["cssclasses"], /\s+/),
				...parseStringOrArray(baseFrontMatter["cssclass"], /\s+/),
			];

			if (cssclasses.length > 0) {
				publishedFrontMatter["cssclasses"] = [...new Set(cssclasses)];
			}
		}

		return publishedFrontMatter;
	}

	private addSocialImage(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			const socialImage =
				baseFrontMatter["socialImage"] ??
				baseFrontMatter["image"] ??
				baseFrontMatter["cover"] ??
				"";

			const socialDescription =
				baseFrontMatter["socialDescription"] ?? "";

			if (socialImage && socialImage !== "") {
				publishedFrontMatter["socialImage"] = socialImage;
			}

			if (socialDescription && socialDescription !== "") {
				publishedFrontMatter["socialDescription"] = socialDescription;
			}
		}

		return publishedFrontMatter;
	}

	private addTimestampsFrontmatter =
		(file: PublishFile) =>
		(
			baseFrontMatter: TFrontmatter,
			newFrontMatter: TPublishedFrontMatter,
		) => {
			const {
				showCreatedTimestamp,
				showUpdatedTimestamp,
				showPublishedTimestamp,
			} = this.settings;

			const overridden = this.settings.includeAllFrontmatter;

			const createdAt = file.meta.getCreatedAt();
			const updatedAt = file.meta.getUpdatedAt();
			const publishedAt = file.meta.getPublishedAt();

			if (createdAt && (showCreatedTimestamp || overridden)) {
				newFrontMatter["created"] = overridden
					? (baseFrontMatter["created"] ??
						baseFrontMatter["date"] ??
						createdAt)
					: createdAt;
			}

			if (updatedAt && (showUpdatedTimestamp || overridden)) {
				newFrontMatter["modified"] = overridden
					? (baseFrontMatter["modified"] ??
						baseFrontMatter["lastmod"] ??
						baseFrontMatter["updated"] ??
						baseFrontMatter["last-modified"] ??
						updatedAt)
					: updatedAt;
			}

			if (publishedAt && (showPublishedTimestamp || overridden)) {
				newFrontMatter["published"] = overridden
					? (baseFrontMatter["published"] ??
						baseFrontMatter["publishDate"] ??
						baseFrontMatter["date"] ??
						publishedAt)
					: publishedAt;
			}

			return newFrontMatter;
		};
}
