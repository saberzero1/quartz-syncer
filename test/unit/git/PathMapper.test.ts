import { PathMapper } from "src/git/PathMapper";

describe("PathMapper", () => {
	describe("toRepoPath", () => {
		it("prefixes with content folder", () => {
			const mapper = new PathMapper("content");
			expect(mapper.toRepoPath("notes/hello.md")).toBe(
				"content/notes/hello.md",
			);
		});

		it("handles root content folder", () => {
			const mapper = new PathMapper("/");
			expect(mapper.toRepoPath("notes/hello.md")).toBe("notes/hello.md");
		});

		it("handles empty content folder", () => {
			const mapper = new PathMapper("");
			expect(mapper.toRepoPath("notes/hello.md")).toBe("notes/hello.md");
		});

		it("strips leading/trailing slashes from folder", () => {
			const mapper = new PathMapper("/content/");
			expect(mapper.toRepoPath("hello.md")).toBe("content/hello.md");
		});
	});

	describe("toVaultPath", () => {
		it("strips content folder prefix", () => {
			const mapper = new PathMapper("content");
			expect(mapper.toVaultPath("content/notes/hello.md")).toBe(
				"notes/hello.md",
			);
		});

		it("returns as-is if no prefix match", () => {
			const mapper = new PathMapper("content");
			expect(mapper.toVaultPath("other/hello.md")).toBe("other/hello.md");
		});

		it("handles root content folder", () => {
			const mapper = new PathMapper("/");
			expect(mapper.toVaultPath("notes/hello.md")).toBe("notes/hello.md");
		});
	});

	describe("isInContentFolder", () => {
		it("returns true for paths in content folder", () => {
			const mapper = new PathMapper("content");
			expect(mapper.isInContentFolder("content/hello.md")).toBe(true);
		});

		it("returns false for paths outside content folder", () => {
			const mapper = new PathMapper("content");
			expect(mapper.isInContentFolder("quartz.config.yaml")).toBe(false);
		});

		it("returns true for all paths when content folder is root", () => {
			const mapper = new PathMapper("/");
			expect(mapper.isInContentFolder("anything.md")).toBe(true);
		});
	});
});
