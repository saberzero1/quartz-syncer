import type { PublishFile } from "src/publishFile/PublishFile";
import { batchParallel, mediaResolveConcurrency } from "src/utils/utils";

export async function resolveLinkedMediaByFile(
	publishFiles: PublishFile[],
): Promise<Map<string, string[]>> {
	const byFile = new Map<string, string[]>();
	const links = await batchParallel(
		publishFiles,
		async (file) => [file.file.path, await file.getBlobLinks()] as const,
		mediaResolveConcurrency(),
	);

	for (const [path, blobLinks] of links) {
		if (blobLinks.length > 0) {
			byFile.set(path, blobLinks);
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
