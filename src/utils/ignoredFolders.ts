/** True if `path` is inside (or equal to) any of the configured ignored folders. */
export function isPathIgnored(path: string, ignoredFolders: string[]): boolean {
	if (ignoredFolders.length === 0) return false;

	return ignoredFolders.some((folder) => {
		if (!folder) return false;
		const normalized = folder.endsWith("/") ? folder : `${folder}/`;
		return path === folder || path.startsWith(normalized);
	});
}
