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
		const createdKeys = this.settings.createdTimestampKey.split(",");

		createdKeys.forEach((key) => {
			const customCreatedDate = this.frontmatter[key.trim()];

			if (customCreatedDate) {
				return customCreatedDate;
			}
		});

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
		const updatedKeys = this.settings.updatedTimestampKey.split(",");

		updatedKeys.forEach((key) => {
			const customUpdatedDate = this.frontmatter[key.trim()];

			if (customUpdatedDate) {
				return customUpdatedDate;
			}
		});

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
		const publishedKeys = this.settings.publishedTimestampKey.split(",");

		publishedKeys.forEach((key) => {
			const customPublishedDate = this.frontmatter[key.trim()];

			if (customPublishedDate) {
				return customPublishedDate;
			}
		});

		return DateTime.fromMillis(this.file.stat.mtime).toISO() as string;
	}
}
