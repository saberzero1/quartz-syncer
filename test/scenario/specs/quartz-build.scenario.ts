import { browser, expect } from "@wdio/globals";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { invokeCliHandler } from "../helpers/cli-invoker";
import { QuartzBuildFixture } from "../helpers/quartz-build-fixture";
import {
	buildOutputExists,
	runQuartzBuild,
} from "../helpers/quartz-build-runner";
import {
	after,
	before,
	beforeEach,
	describe,
	it,
	type TestContext,
} from "../helpers/test-globals";

const templateRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../vault-templates",
);

async function ensureFolder(path: string): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, { path }) => {
			const existing = app.vault.getAbstractFileByPath(path);
			if (!existing) {
				await app.vault.createFolder(path);
			}
		},
		{ path },
	);
}

async function createVaultMarkdown(
	path: string,
	content: string,
): Promise<void> {
	const folder = path.split("/").slice(0, -1).join("/");
	if (folder) {
		await ensureFolder(folder);
	}
	await browser.executeObsidian(
		async ({ app }, { path, content }) => {
			await app.vault.create(path, content);
		},
		{ path, content },
	);
}

async function createVaultBinary(path: string, base64: string): Promise<void> {
	const folder = path.split("/").slice(0, -1).join("/");
	if (folder) {
		await ensureFolder(folder);
	}
	await browser.executeObsidian(
		async ({ app }, { path, base64 }) => {
			const raw = atob(base64);
			const bytes = new Uint8Array(raw.length);
			for (let i = 0; i < raw.length; i += 1) {
				bytes[i] = raw.charCodeAt(i);
			}
			await app.vault.createBinary(path, bytes.buffer);
		},
		{ path, base64 },
	);
}

async function deleteVaultPath(path: string): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, { path }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) {
				await app.vault.delete(file);
			}
		},
		{ path },
	);
}

async function cleanupVault(paths: string[]): Promise<void> {
	for (const path of paths) {
		await deleteVaultPath(path);
	}
}

function buildPageExists(quartzDir: string, slug: string): boolean {
	const lower = slug.toLowerCase().replace(/\s+/g, "-");
	return (
		existsSync(join(quartzDir, "public", lower, "index.html")) ||
		existsSync(join(quartzDir, "public", slug, "index.html")) ||
		existsSync(join(quartzDir, "public", `${lower}.html`)) ||
		existsSync(join(quartzDir, "public", `${slug}.html`))
	);
}

describe("Quartz build verification", function () {
	describe("Basic build tests", function () {
		const fixture = new QuartzBuildFixture();
		let fixturePath: string;
		const vaultPaths = ["index.md", "Valid.md"];

		before(async function () {
			fixturePath = await fixture.create();
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(vaultPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(vaultPaths);
			await fixture.destroy();
		});

		it("basic note builds successfully", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nHello Quartz.",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});

		it("invalid YAML fails the build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"Valid.md",
				"---\ntitle: Valid\npublish: true\n---\nSafe content.",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			writeFileSync(
				join(fixture.path, "content", "broken.md"),
				"---\ninvalid: [\n---\nBroken content.",
			);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).not.toBe(0);
		});

		it("callouts, math, and footnotes build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Complex\npublish: true\n---\n> [!note] Title\n> Content\n\n$x_i + y^2$\n\nText[^1]\n\n[^1]: Footnote",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});
	});

	describe("Link and media tests", function () {
		const fixture = new QuartzBuildFixture();
		let fixturePath: string;
		const vaultPaths = [
			"index.md",
			"Second Note.md",
			"Image Note.md",
			"images/test-image.png",
		];

		before(async function () {
			fixturePath = await fixture.create();
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(vaultPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(vaultPaths);
			await fixture.destroy();
		});

		it("wikilinks resolve across notes", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\n[[Second Note]]\n[[Second Note|Display Text]]\n[[Second Note#Heading]]",
			);
			await createVaultMarkdown(
				"Second Note.md",
				"---\ntitle: Second\npublish: true\n---\n## Heading\nContent",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});

		it("image embeds build and copy media", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\n[[Image Note]]",
			);
			await createVaultMarkdown(
				"Image Note.md",
				"---\ntitle: Image Note\npublish: true\n---\n![[images/test-image.png]]",
			);
			const imageBase64 = readFileSync(
				join(templateRoot, "media-heavy", "images", "test-image.png"),
			).toString("base64");
			await createVaultBinary("images/test-image.png", imageBase64);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);
			expect(
				existsSync(
					join(fixture.path, "content", "images", "test-image.png"),
				),
			).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});
	});

	describe("Edge case tests", function () {
		const fixture = new QuartzBuildFixture();
		let fixturePath: string;
		const vaultPaths = [
			"index.md",
			"日本語.md",
			"All Frontmatter.md",
			"Dataview.md",
			"NoteA.md",
			"NoteB.md",
			"NoteC.md",
			"Bom.md",
		];

		before(async function () {
			fixturePath = await fixture.create();
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(vaultPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(vaultPaths);
			await fixture.destroy();
		});

		it("unicode filenames build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nIndex content.",
			);
			await createVaultMarkdown(
				"日本語.md",
				"---\ntitle: 日本語\npublish: true\n---\nUnicode content.",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});

		it("all frontmatter fields build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nLanding page.",
			);
			await createVaultMarkdown(
				"All Frontmatter.md",
				"---\ntitle: Full\ndescription: Full frontmatter\naliases: [Alt Title]\ntags: [one, two]\ncssclasses: [class-one]\npermalink: /custom-link\ndraft: false\ncomments: true\nlang: en\nenableToc: true\nsocialImage: https://example.com/image.png\nsocialDescription: Social summary\npublish: true\n---\nFull frontmatter body.",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});

		it("dataview inline fields build as text", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nLanding page.",
			);
			await createVaultMarkdown(
				"Dataview.md",
				"---\ntitle: Dataview\npublish: true\n---\nkey:: value",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});

		it("cross-linked notes build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nLanding page.",
			);
			await createVaultMarkdown(
				"NoteA.md",
				"---\ntitle: NoteA\npublish: true\n---\n[[NoteB]]",
			);
			await createVaultMarkdown(
				"NoteB.md",
				"---\ntitle: NoteB\npublish: true\n---\n[[NoteC]]",
			);
			await createVaultMarkdown(
				"NoteC.md",
				"---\ntitle: NoteC\npublish: true\n---\n[[NoteA]]",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);

			expect(buildPageExists(fixture.path, "NoteA")).toBe(true);
			expect(buildPageExists(fixture.path, "NoteB")).toBe(true);
			expect(buildPageExists(fixture.path, "NoteC")).toBe(true);
		});

		it("CRLF with BOM builds", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nLanding page.",
			);
			await createVaultMarkdown(
				"Bom.md",
				"\uFEFF---\r\ntitle: Bom\r\npublish: true\r\n---\r\nCRLF content.\r\n",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});
	});

	describe("Boundary tests", function () {
		const fixture = new QuartzBuildFixture();
		let fixturePath: string;
		const vaultPaths = ["index.md", "Blockquote.md"];

		before(async function () {
			fixturePath = await fixture.create();
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(vaultPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(vaultPaths);
			await fixture.destroy();
		});

		it("empty publish still runs build", async function (this: TestContext) {
			this.timeout(60000);
			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(typeof publishResult.success).toBe("boolean");

			const buildResult = runQuartzBuild(fixture.path);
			console.log(
				`Quartz build exit code (empty publish): ${buildResult.exitCode}`,
			);
			expect(Number.isFinite(buildResult.exitCode)).toBe(true);
		});

		it("blockquotes and horizontal rules build", async function (this: TestContext) {
			this.timeout(60000);
			await createVaultMarkdown(
				"index.md",
				"---\ntitle: Index\npublish: true\n---\nLanding page.",
			);
			await createVaultMarkdown(
				"Blockquote.md",
				"---\ntitle: Blockquote\npublish: true\n---\n> blockquote\n\n---\n\nMore content",
			);

			const publishResult = await invokeCliHandler(
				"quartz-syncer:publish",
			);
			expect(publishResult.success).toBe(true);

			const buildResult = runQuartzBuild(fixture.path);
			expect(buildResult.exitCode).toBe(0);
			expect(buildOutputExists(fixture.path)).toBe(true);
		});
	});
});
