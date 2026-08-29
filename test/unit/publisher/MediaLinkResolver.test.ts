import { describe, it, expect, vi } from "vitest";
import { resolveLinkedMedia } from "src/publisher/MediaLinkResolver";
import type { PublishFile } from "src/publishFile/PublishFile";

const makePublishFile = (blobLinks: string[]): PublishFile =>
	({
		getBlobLinks: vi.fn().mockResolvedValue(blobLinks),
	}) as unknown as PublishFile;

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
