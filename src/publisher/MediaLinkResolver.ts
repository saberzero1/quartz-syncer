import type { PublishFile } from "src/publishFile/PublishFile";

export async function resolveLinkedMedia(
	publishFiles: PublishFile[],
): Promise<Set<string>> {
	const linkedPaths = new Set<string>();

	for (const file of publishFiles) {
		const blobLinks = await file.getBlobLinks();

		for (const link of blobLinks) {
			linkedPaths.add(link);
		}
	}

	return linkedPaths;
}
