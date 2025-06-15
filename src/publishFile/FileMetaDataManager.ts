import { FrontMatterCache, TFile } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { DateTime } from "luxon";

/**
 * FileMetadataManager class.
 * This class is responsible for managing file metadata, including created, updated, and published timestamps.
 */
export class FileMetadataManager {
	file: TFile;
	frontmatter: FrontMatterCache;
	settings: QuartzSyncerSettings;

	constructor(
		file: TFile,
		frontmatter: FrontMatterCache,
		settings: QuartzSyncerSettings,
	) {
		this.file = file;
		this.frontmatter = frontmatter;
		this.settings = settings;
	}

	/**
	 * Returns the created date of the file.
	 * If a custom created date is specified in the frontmatter, it returns that.
	 * Otherwise, it returns the file's creation time.
	 *
	 * @returns The created date as an ISO string.
	 */
	getCreatedAt(): string {
		const createdKey = this.settings.createdTimestampKey;

		if (createdKey) {
			const customCreatedDate = this.frontmatter[createdKey];

			if (!customCreatedDate) {
				return "";
			}

			return customCreatedDate;
		}

		return DateTime.fromMillis(this.file.stat.ctime).toISO() as string;
	}

	/**
	 * Returns the updated date of the file.
	 * If a custom updated date is specified in the frontmatter, it returns that.
	 * Otherwise, it returns the file's last modified time.
	 *
	 * @returns The updated date as an ISO string.
	 */
	getUpdatedAt(): string {
		const updatedKey = this.settings.updatedTimestampKey;

		if (updatedKey) {
			const customUpdatedDate = this.frontmatter[updatedKey];

			if (!customUpdatedDate) {
				return "";
			}

			return this.frontmatter[updatedKey];
		}

		return DateTime.fromMillis(this.file.stat.mtime).toISO() as string;
	}

	/**
	 * Returns the published date of the file.
	 * If a custom published date is specified in the frontmatter, it returns that.
	 * Otherwise, it returns the file's last modified time.
	 *
	 * @returns The published date as an ISO string.
	 */
	getPublishedAt(): string {
		const publishedKey = this.settings.publishedTimestampKey;

		if (publishedKey) {
			const customPublishedDate = this.frontmatter[publishedKey];

			if (!customPublishedDate) {
				return "";
			}

			return customPublishedDate;
		}

		return DateTime.fromMillis(this.file.stat.mtime).toISO() as string;
	}
}
