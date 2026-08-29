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
	"../vault-templates/basic",
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

async function readVaultFile(path: string): Promise<string> {
	return browser.executeObsidian(
		async ({ app }, { path }) => {
			const file = app.vault.getFileByPath(path);
			if (!file) return "";
			return app.vault.read(file);
		},
		{ path },
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

describe("Edge cases", function () {
	describe("Scenario 35", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["Target.md"];

		before(async function () {
			fixturePath = await fixture.create("custom-content-dir");
			assertions = new RepoAssertions(fixture);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(templatePaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(templatePaths);
			await fixture.destroy();
		});

		it("scenario 35: Non-default content folder works", async function (this: TestContext) {
			this.timeout(30000);
			await invokeCliHandler("quartz-syncer:config", {
				action: "set",
				key: "contentFolder",
				value: "docs",
			});
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await invokeCliHandler("quartz-syncer:publish");

			assertions.fileExists("docs/Target.md");
			assertions.fileNotExists("content/Target.md");

			await invokeCliHandler("quartz-syncer:config", {
				action: "set",
				key: "contentFolder",
				value: "content",
			});
		});
	});

	describe("Scenario 36", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["NoFrontmatter.md"];

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
			await cleanupVault(templatePaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(templatePaths);
			await fixture.destroy();
		});

		it("scenario 36: File with no frontmatter gets frontmatter added by mark", async function () {
			await createVaultMarkdown(
				"NoFrontmatter.md",
				"No frontmatter here.",
			);
			const beforeTree = fixture.getFileTree();
			const result = await invokeCliHandler("quartz-syncer:mark", {
				path: "NoFrontmatter.md",
				state: "publish",
			});
			expect(result.success).toBe(true);

			const content = await readVaultFile("NoFrontmatter.md");
			expect(content).toContain("---\npublish: true\n---");
			await assertions.fileTreeUnchanged(beforeTree);
		});
	});

	describe("Scenario 37", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["测试笔记.md"];

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
			await cleanupVault(templatePaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(templatePaths);
			await fixture.destroy();
		});

		it("scenario 37: Unicode/CJK filenames work", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"测试笔记.md",
				"---\ntitle: 测试\npublish: true\n---\nUnicode note.",
			);
			await invokeCliHandler("quartz-syncer:publish");
			assertions.fileExists("content/测试笔记.md");
		});
	});

	describe("Scenario 38", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["notes/topic-a/subfolder/deep-note.md"];

		before(async function () {
			fixturePath = await fixture.create("content-heavy");
			assertions = new RepoAssertions(fixture);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await cleanupVault(templatePaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(templatePaths);
			await fixture.destroy();
		});

		it("scenario 38: Deeply nested paths work", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"notes/topic-a/subfolder/deep-note.md",
				"---\ntitle: Deep Note\npublish: true\n---\nDeep nesting.",
			);
			await invokeCliHandler("quartz-syncer:publish");
			assertions.fileExists(
				"content/notes/topic-a/subfolder/deep-note.md",
			);
		});
	});
});
