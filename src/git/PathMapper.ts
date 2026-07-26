export class PathMapper {
	constructor(private contentFolder: string) {}

	toRepoPath(vaultPath: string): string {
		const folder = this.contentFolder.replace(/^\/|\/$/g, "");
		if (!folder) return vaultPath;
		return `${folder}/${vaultPath}`;
	}

	toVaultPath(repoPath: string): string {
		const folder = this.contentFolder.replace(/^\/|\/$/g, "");
		if (!folder) return repoPath;
		const prefix = `${folder}/`;
		if (repoPath.startsWith(prefix)) {
			return repoPath.slice(prefix.length);
		}
		return repoPath;
	}

	isInContentFolder(repoPath: string): boolean {
		const folder = this.contentFolder.replace(/^\/|\/$/g, "");
		if (!folder) return true;
		return repoPath.startsWith(`${folder}/`);
	}
}
