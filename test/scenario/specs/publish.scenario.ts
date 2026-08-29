import { browser, expect } from "@wdio/globals";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { FixtureManager } from "../helpers/fixture-manager";
import { invokeCliHandler } from "../helpers/cli-invoker";
import { RepoAssertions } from "../helpers/repo-assertions";
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

function loadTemplate(template: string, filename: string): string {
	return readFileSync(join(templateRoot, template, filename), "utf-8");
}

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

describe("Publish correctness", function () {
	describe("Scenario 6, 10-12", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const basicPaths = ["Target.md", "Draft.md", "Unset.md"];
		const mediaPaths = ["Photo Post.md", "images/test-image.png"];

		before(async function () {
			fixturePath = await fixture.create("minimal");
			assertions = new RepoAssertions(fixture);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault([...basicPaths, ...mediaPaths]);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault([...basicPaths, ...mediaPaths]);
			await fixture.destroy();
		});

		it("scenario 6: First publish creates file in content/", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await createVaultMarkdown(
				"Draft.md",
				loadTemplate("basic", "Draft.md"),
			);
			await createVaultMarkdown(
				"Unset.md",
				loadTemplate("basic", "Unset.md"),
			);

			const result = await invokeCliHandler("quartz-syncer:publish");
			expect(result.success).toBe(true);

			assertions.fileExists("content/Target.md");
			assertions.fileContains("content/Target.md", "title: Target");
		});

		it("scenario 10: Publish with media copies images", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Photo Post.md",
				loadTemplate("media-heavy", "Photo Post.md"),
			);
			const imageBase64 = readFileSync(
				join(templateRoot, "media-heavy", "images", "test-image.png"),
			).toString("base64");
			await createVaultBinary("images/test-image.png", imageBase64);

			const result = await invokeCliHandler("quartz-syncer:publish");
			expect(result.success).toBe(true);

			assertions.fileExists("content/images/test-image.png");
		});

		it("scenario 11: Published frontmatter has required fields", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await invokeCliHandler("quartz-syncer:publish");

			const content = fixture.readFile("content/Target.md");
			expect(content).toContain("title: Target");
			expect(content).toContain("publish: true");
			expect(/(created|modified|updated|lastmod):/i.test(content)).toBe(
				true,
			);
		});

		it("scenario 12: Only publish-flagged notes are published", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await createVaultMarkdown(
				"Draft.md",
				loadTemplate("basic", "Draft.md"),
			);
			await createVaultMarkdown(
				"Unset.md",
				loadTemplate("basic", "Unset.md"),
			);
			await invokeCliHandler("quartz-syncer:publish");

			assertions.fileExists("content/Target.md");
			assertions.fileNotExists("content/Draft.md");
			assertions.fileNotExists("content/Unset.md");
		});
	});

	describe("Scenario 7-9", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const basicPaths = ["Target.md", "Draft.md", "Unset.md"];

		before(async function () {
			fixturePath = await fixture.create("customized");
			assertions = new RepoAssertions(fixture);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(basicPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(basicPaths);
			await fixture.destroy();
		});

		it("scenario 7: Publish preserves existing content", async function (this: TestContext) {
			this.timeout(30000);
			const beforeIndex = fixture.readFile("content/index.md");
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			const afterIndex = fixture.readFile("content/index.md");

			expect(afterIndex).toBe(beforeIndex);
			assertions.fileExists("content/Target.md");
		});

		it("scenario 8: Publish doesn't touch custom.scss", async function (this: TestContext) {
			this.timeout(30000);
			const before = fixture.readFile("quartz/styles/custom.scss");
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			const after = fixture.readFile("quartz/styles/custom.scss");

			expect(after).toBe(before);
		});

		it("scenario 9: Publish doesn't touch config files", async function (this: TestContext) {
			this.timeout(30000);
			const before = fixture.readFile("quartz.config.yaml");
			await createVaultMarkdown(
				"Target.md",
				loadTemplate("basic", "Target.md"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			const after = fixture.readFile("quartz.config.yaml");

			expect(after).toBe(before);
		});
	});
});
