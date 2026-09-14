import { Platform } from "obsidian";
import { expect, test } from "vitest";
import type { PublishFile } from "src/publishFile/PublishFile";
import { resolveLinkedMediaByFile } from "src/publisher/MediaLinkResolver";
import {
	attachments,
	markdownFiles,
	mediaOptions,
	NOTE_COUNT,
	report,
} from "./fixtures";

test("resolveLinkedMediaByFile with asynchronous reads", async ({ bench }) => {
	expect(Platform.isDesktopApp).toBe(true);
	expect(Platform.isMobileApp).toBe(false);
	let active = 0;
	let peak = 0;
	let calls = 0;
	const files = markdownFiles.map((file, index) => {
		const links = [attachments[index % attachments.length]!.path];
		return {
			file,
			async getBlobLinks() {
				calls++;
				peak = Math.max(peak, ++active);
				// Real per-note I/O latency; a resolved promise would mostly measure
				// batching overhead, not the benefit of overlapping asynchronous work.
				await new Promise<void>((resolve) => setTimeout(resolve, 1));
				active--;
				return links;
			},
		} satisfies Pick<PublishFile, "file" | "getBlobLinks">;
	}) as PublishFile[];
	const expected = new Map(
		markdownFiles.map((file, index) => [
			file.path,
			[attachments[index % attachments.length]!.path],
		]),
	);
	let byFile = new Map<string, string[]>();
	const result = await bench(
		"resolveLinkedMediaByFile / 10000 notes / 1ms I/O / desktop",
		{
			async: true,
			beforeEach: () => {
				calls = 0;
				peak = 0;
			},
			afterEach: () => {
				expect(calls).toBe(NOTE_COUNT);
				expect(active).toBe(0);
				expect([1, 5]).toContain(peak);
				expect(byFile).toEqual(expected);
			},
		},
		async () => {
			byFile = await resolveLinkedMediaByFile(files);
		},
	).run(mediaOptions);
	report(result, {
		kind: "media",
		resolvedNotes: byFile.size,
		peakConcurrency: peak,
		readDelayMs: 1,
	});
});
