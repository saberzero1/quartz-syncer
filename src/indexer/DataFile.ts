/** Markdown file representation for the Quartz Syncer datastore. */
export type DataFile = {
	/** The path of the file, relative to the vault root. */
	path: string;
	/** The UNIX epoch time in milliseconds that the data was written to cache. */
	time: number;
	/** The parsed file content */
	content: string;
};
