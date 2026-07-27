import { describe, expect, it, vi } from "vitest";
import { FileManager, MetadataCache, TFile, Vault } from "obsidian";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

function makeMetadataCache(frontmatter: Record<string, unknown>) {
	const metadataCache = new MetadataCache();
	metadataCache.getCache = vi.fn().mockReturnValue({
		frontmatter,
	});
	return metadataCache;
}

describe("ObsidianFrontMatterEngine", () => {
	it("gets and sets values with a merged snapshot", () => {
		const file = new TFile();
		file.path = "notes/test.md";
		const metadataCache = makeMetadataCache({ title: "Old", position: {} });
		const engine = new ObsidianFrontMatterEngine(
			new Vault(),
			metadataCache,
			file,
			{ processFrontMatter: vi.fn() } as unknown as FileManager,
		);

		expect(engine.get("title")).toBe("Old");
		engine.set("title", "New");
		expect(engine.get("title")).toBe("New");
	});

	it("apply writes merged frontmatter via FileManager", async () => {
		const file = new TFile();
		file.path = "notes/test.md";
		const metadataCache = makeMetadataCache({ title: "Old" });
		let mutatedFrontMatter: Record<string, unknown> | undefined;
		const processFrontMatter = vi.fn(
			async (
				_file: TFile,
				callback: (frontMatter: Record<string, unknown>) => void,
			) => {
				const frontMatter = { title: "Old" } as Record<
					string,
					unknown
				>;
				callback(frontMatter);
				mutatedFrontMatter = frontMatter;
				return frontMatter;
			},
		);
		const engine = new ObsidianFrontMatterEngine(
			new Vault(),
			metadataCache,
			file,
			{ processFrontMatter } as unknown as FileManager,
		);

		engine.set("published", true).remove("title");
		await engine.apply();

		expect(processFrontMatter).toHaveBeenCalledWith(
			file,
			expect.any(Function),
		);
		expect(mutatedFrontMatter).toEqual({
			title: undefined,
			published: true,
		});
	});
});
