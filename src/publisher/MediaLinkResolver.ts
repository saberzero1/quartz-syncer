import type { PublishFile } from "src/publishFile/PublishFile";

export async function resolveLinkedMediaByFile(
	publishFiles: PublishFile[],
): Promise<Map<string, string[]>> {
	const byFile = new Map<string, string[]>();

	for (const file of publishFiles) {
		const blobLinks = await file.getBlobLinks();

		if (blobLinks.length > 0) {
			byFile.set(file.file.path, blobLinks);
		}
	}

	return byFile;
}

export function flattenLinkedMedia(byFile: Map<string, string[]>): Set<string> {
	const linkedPaths = new Set<string>();

	for (const links of byFile.values()) {
		for (const link of links) {
			linkedPaths.add(link);
		}
	}

	return linkedPaths;
}

export async function resolveLinkedMedia(
	publishFiles: PublishFile[],
): Promise<Set<string>> {
	return flattenLinkedMedia(await resolveLinkedMediaByFile(publishFiles));
}
