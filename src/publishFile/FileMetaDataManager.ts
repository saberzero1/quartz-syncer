import { FrontMatterCache, TFile } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { DateTime } from "luxon";

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
