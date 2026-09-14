import { Platform } from "obsidian";
import { expect, test } from "vitest";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import type { PublishFile } from "src/publishFile/PublishFile";
import { resolveLinkedMediaByFile } from "src/publisher/MediaLinkResolver";
import {
	attachments,
	candidateFixture,
	markdownFiles,
	mediaOptions,
	NOTE_COUNT,
	report,
} from "./fixtures";

test("status-shaped candidate and media pipeline", async ({ bench }) => {
	expect(Platform.isDesktopApp).toBe(true);
	expect(Platform.isMobileApp).toBe(false);
	const { app, plugin, settings, allFiles } = candidateFixture();
	const filesByPath = new Map(allFiles.map((file) => [file.path, file]));
	const expectedMedia = new Map(
		markdownFiles.map((file, index) => [
			file.path,
			[attachments[index % attachments.length]!.path],
		]),
	);
	const initial = collectCandidatePaths(app, plugin, settings);
	const expectedCandidates = initial.has(attachments[0]!.path)
		? allFiles
		: markdownFiles;
	expect(initial).toEqual(
		new Set(expectedCandidates.map((file) => file.path)),
	);
	let paths = initial;
	let publishFiles: PublishFile[] = [];
	let byFile = new Map<string, string[]>();
	let calls = 0;
	let binaryCalls = 0;
	let active = 0;
	let peak = 0;
	const result = await bench(
		"Status-shaped / candidates to media / 10000 notes + 5000 attachments",
		{
			async: true,
			beforeEach: () => {
				calls = 0;
				binaryCalls = 0;
				peak = 0;
			},
			afterEach: () => {
				expect(paths.size).toBe(expectedCandidates.length);
				expect(publishFiles.length).toBe(paths.size);
				expect(calls).toBe(paths.size);
				expect(binaryCalls).toBe(paths.size - NOTE_COUNT);
				expect(active).toBe(0);
				expect([1, 5]).toContain(peak);
				expect(byFile).toEqual(expectedMedia);
			},
		},
		async () => {
			paths = collectCandidatePaths(app, plugin, settings);
			// Mapping/allocation is timed too. Binary candidates incur the same
			// async lookup but return no links, leaving identical useful output.
			publishFiles = Array.from(paths, (path) => {
				const file = filesByPath.get(path);
				if (!file) throw new Error(`Unknown candidate: ${path}`);
				const links = expectedMedia.get(path) ?? [];
				return {
					file,
					async getBlobLinks() {
						calls++;
						if (file.extension !== "md") binaryCalls++;
						peak = Math.max(peak, ++active);
						await new Promise<void>((resolve) =>
							setTimeout(resolve, 1),
						);
						active--;
						return links;
					},
				} satisfies Pick<PublishFile, "file" | "getBlobLinks">;
			}) as PublishFile[];
			byFile = await resolveLinkedMediaByFile(publishFiles);
		},
	).run(mediaOptions);
	report(result, {
		kind: "status",
		candidateCount: paths.size,
		mappedPublishFileCount: publishFiles.length,
		blobLookupCount: calls,
		binaryBlobLookupCount: binaryCalls,
		resolvedNotes: byFile.size,
		peakConcurrency: peak,
		readDelayMs: 1,
	});
});
