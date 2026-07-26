const CACHE_PREFIX = "quartz-syncer/cache/";

export async function detectOldDatabases(): Promise<string[]> {
	if (typeof indexedDB === "undefined") return [];
	if (typeof indexedDB.databases !== "function") return [];

	const dbs = await indexedDB.databases();
	return dbs
		.filter(
			(db) =>
				db.name != null &&
				db.name.startsWith("quartz-syncer") &&
				!db.name.startsWith(CACHE_PREFIX),
		)
		.map((db) => db.name!);
}

export async function cleanupOldDatabases(): Promise<number> {
	const old = await detectOldDatabases();
	for (const name of old) {
		indexedDB.deleteDatabase(name);
	}
	return old.length;
}
