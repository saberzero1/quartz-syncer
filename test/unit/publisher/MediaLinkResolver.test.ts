import { describe, it, expect, vi } from "vitest";
import { Platform } from "obsidian";
import {
	flattenLinkedMedia,
	resolveLinkedMedia,
	resolveLinkedMediaByFile,
} from "src/publisher/MediaLinkResolver";
import type { PublishFile } from "src/publishFile/PublishFile";

let publishFileSeq = 0;

const makePublishFile = (
	blobLinks: string[],
	path = `notes/file-${publishFileSeq++}.md`,
): PublishFile =>
	({
		file: { path },
		getBlobLinks: vi.fn().mockResolvedValue(blobLinks),
	}) as unknown as PublishFile;

describe("resolveLinkedMediaByFile", () => {
	it("keys non-empty links by file path and preserves flattening order", async () => {
		const files = [
			makePublishFile(
				["images/a.png", "images/shared.png"],
				"notes/a.md",
			),
			makePublishFile([], "notes/empty.md"),
			makePublishFile(
				["images/shared.png", "images/b.png"],
				"notes/b.md",
			),
		];

		const result = await resolveLinkedMediaByFile(files);

		expect([...result.keys()]).toEqual(["notes/a.md", "notes/b.md"]);
		expect([...flattenLinkedMedia(result)]).toEqual([
			"images/a.png",
			"images/shared.png",
			"images/b.png",
		]);
	});

	it.each([
		{ mobile: false, concurrency: 5 },
		{ mobile: true, concurrency: 2 },
	])(
		"bounds extraction to $concurrency with mobile=$mobile",
		async ({ mobile, concurrency }) => {
			const originalMobile = Platform.isMobileApp;
			Platform.isMobileApp = mobile;
			vi.useFakeTimers();

			try {
				let active = 0;
				let peak = 0;
				const files = Array.from({ length: 12 }, (_, index) => {
					const file = makePublishFile([], `notes/${index}.md`);
					vi.mocked(file.getBlobLinks).mockImplementation(
						async () => {
							active += 1;
							peak = Math.max(peak, active);
							await new Promise((resolve) =>
								setTimeout(resolve, 12 - index),
							);
							active -= 1;
							return [`images/${index}.png`];
						},
					);
					return file;
				});

				const pending = resolveLinkedMediaByFile(files);
				expect(active).toBe(concurrency);
				await vi.runAllTimersAsync();
				const result = await pending;

				expect(peak).toBe(concurrency);
				expect(active).toBe(0);
				expect([...result.keys()]).toEqual(
					files.map((file) => file.file.path),
				);

				for (const file of files) {
					expect(file.getBlobLinks).toHaveBeenCalledOnce();
				}
			} finally {
				Platform.isMobileApp = originalMobile;
				vi.useRealTimers();
			}
		},
	);
});

describe("resolveLinkedMedia", () => {
	it("returns empty set for empty array input", async () => {
		const result = await resolveLinkedMedia([]);

		expect(result).toBeInstanceOf(Set);
		expect(result.size).toBe(0);
	});

	it("returns empty set for single file with no blob links", async () => {
		const file = makePublishFile([]);

		const result = await resolveLinkedMedia([file]);

		expect(result.size).toBe(0);
	});

	it("returns set with all blob links for single file", async () => {
		const file = makePublishFile(["img/a.png", "img/b.jpg"]);

		const result = await resolveLinkedMedia([file]);

		expect(result).toEqual(new Set(["img/a.png", "img/b.jpg"]));
	});

	it("deduplicates overlapping links from multiple files", async () => {
		const file1 = makePublishFile(["img/a.png", "img/shared.png"]);
		const file2 = makePublishFile(["img/b.jpg", "img/shared.png"]);

		const result = await resolveLinkedMedia([file1, file2]);

		expect(result).toEqual(
			new Set(["img/a.png", "img/shared.png", "img/b.jpg"]),
		);
		expect(result.size).toBe(3);
	});

	it("collects only non-empty links when some files have empty blob links", async () => {
		const file1 = makePublishFile([]);
		const file2 = makePublishFile(["img/a.png"]);
		const file3 = makePublishFile([]);

		const result = await resolveLinkedMedia([file1, file2, file3]);

		expect(result).toEqual(new Set(["img/a.png"]));
		expect(result.size).toBe(1);
	});

	it("calls getBlobLinks on each file", async () => {
		const file1 = makePublishFile(["img/a.png"]);
		const file2 = makePublishFile(["img/b.jpg"]);

		await resolveLinkedMedia([file1, file2]);

		expect(file1.getBlobLinks).toHaveBeenCalledOnce();
		expect(file2.getBlobLinks).toHaveBeenCalledOnce();
	});

	it("handles multiple files all with overlapping links (full dedup)", async () => {
		const file1 = makePublishFile(["img/same.png"]);
		const file2 = makePublishFile(["img/same.png"]);
		const file3 = makePublishFile(["img/same.png"]);

		const result = await resolveLinkedMedia([file1, file2, file3]);

		expect(result.size).toBe(1);
		expect(result.has("img/same.png")).toBe(true);
	});

	it("collects links from many files with distinct links", async () => {
		const files = ["img/a.png", "img/b.jpg", "img/c.gif", "img/d.svg"].map(
			(link) => makePublishFile([link]),
		);

		const result = await resolveLinkedMedia(files);

		expect(result.size).toBe(4);
		expect(result.has("img/a.png")).toBe(true);
		expect(result.has("img/b.jpg")).toBe(true);
		expect(result.has("img/c.gif")).toBe(true);
		expect(result.has("img/d.svg")).toBe(true);
	});
});
