import {
	isFrontmatterImageKey,
	parseFrontmatterWikilink,
} from "src/utils/frontmatterImages";

describe("frontmatterImages", () => {
	describe("isFrontmatterImageKey", () => {
		it("accepts social image keys and indexed list keys", () => {
			expect(isFrontmatterImageKey("socialImage")).toBe(true);
			expect(isFrontmatterImageKey("image")).toBe(true);
			expect(isFrontmatterImageKey("cover")).toBe(true);
			expect(isFrontmatterImageKey("image.0")).toBe(true);
		});

		it("rejects other keys", () => {
			expect(isFrontmatterImageKey("related")).toBe(false);
			expect(isFrontmatterImageKey("images")).toBe(false);
		});
	});

	describe("parseFrontmatterWikilink", () => {
		it("extracts the link path", () => {
			expect(parseFrontmatterWikilink("[[cover.jpg]]")).toBe("cover.jpg");
			expect(parseFrontmatterWikilink("![[cover.jpg]]")).toBe(
				"cover.jpg",
			);
		});

		it("drops anchors and display text", () => {
			expect(parseFrontmatterWikilink("[[a/b.png#x|alt]]")).toBe(
				"a/b.png",
			);
		});

		it("returns null for anything else", () => {
			expect(parseFrontmatterWikilink("cover.jpg")).toBeNull();
			expect(parseFrontmatterWikilink("https://x.y/a.jpg")).toBeNull();
			expect(parseFrontmatterWikilink(42)).toBeNull();
			expect(parseFrontmatterWikilink("see [[a.jpg]] here")).toBeNull();
		});
	});
});
