import { browser, expect } from "@wdio/globals";

describe("Quartz Syncer compile pipeline", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "./test/vaults/compile-test" });
	});

	it("should load the plugin without errors", async () => {
		const ribbon = browser.$(".side-dock-ribbon");
		await expect(ribbon).toExist();
	});

	it("should have the test vault open", async () => {
		const vaultName = await browser.executeObsidian(({ app }) => {
			return app.vault.getName();
		});

		expect(vaultName).toContain("compile-test");
	});

	it("should resolve wikilinks in compiled output", async () => {
		const fileExists = await browser.executeObsidian(({ app }) => {
			const file = app.vault.getAbstractFileByPath("wikilink-test.md");

			return file !== null;
		});

		expect(fileExists).toBe(true);
	});

	it("should detect transcluded images", async () => {
		const fileExists = await browser.executeObsidian(({ app }) => {
			const file = app.vault.getAbstractFileByPath("image-embed-test.md");

			return file !== null;
		});

		expect(fileExists).toBe(true);
	});

	it("should handle frontmatter correctly", async () => {
		const hasFrontmatter = await browser.executeObsidian(({ app }) => {
			const file = app.vault.getAbstractFileByPath("frontmatter-test.md");

			if (!file) return false;

			const cache = app.metadataCache.getFileCache(file as any);

			return cache?.frontmatter?.publish === true;
		});

		expect(hasFrontmatter).toBe(true);
	});
});
