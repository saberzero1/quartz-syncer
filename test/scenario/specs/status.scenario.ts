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

async function createVaultMarkdown(
	path: string,
	content: string,
): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, { path, content }) => {
			const existing = app.vault.getAbstractFileByPath(path);
			if (!existing) {
				await app.vault.create(path, content);
			}
		},
		{ path, content },
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

describe("Status correctness", function () {
	describe("Scenario 20-21", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["Target.md", "Draft.md", "Unset.md"];

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

		it("scenario 20: Status shows unpublished files", async function () {
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await createVaultMarkdown(
				"Draft.md",
				readFileSync(join(templateRoot, "Draft.md"), "utf-8"),
			);
			await createVaultMarkdown(
				"Unset.md",
				readFileSync(join(templateRoot, "Unset.md"), "utf-8"),
			);

			const result = await invokeCliHandler("quartz-syncer:status");
			expect(result.success).toBe(true);
			const data = result.data as {
				unpublished: number;
				changed: number;
				published: number;
				deleted: number;
			};
			expect(data.unpublished).toBe(1);
			expect(data.published).toBe(0);
			expect(data.changed).toBe(0);
		});

		it("scenario 21: Status shows published files after publish", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			assertions.fileExists("content/Target.md");

			const result = await invokeCliHandler("quartz-syncer:status");
			expect(result.success).toBe(true);
			const data = result.data as {
				unpublished: number;
				changed: number;
				published: number;
				deleted: number;
			};
			expect(data.published).toBe(1);
			expect(data.unpublished).toBe(0);
			expect(data.changed).toBe(0);
		});
	});

	describe("Scenario 22-23", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["Target.md"];

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

		it("scenario 22: Status shows changed files after edit", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			assertions.fileExists("content/Target.md");

			await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getFileByPath("Target.md");
				if (file) {
					const current = await app.vault.read(file);
					await app.vault.modify(file, `${current}\nUpdated.`);
				}
			});

			const result = await invokeCliHandler("quartz-syncer:status");
			expect(result.success).toBe(true);
			const data = result.data as {
				changed: number;
			};
			expect(data.changed).toBe(1);
		});

		it("scenario 23: Status shows deleted files after unmark", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await invokeCliHandler("quartz-syncer:publish");
			await invokeCliHandler("quartz-syncer:mark", {
				path: "Target.md",
				state: "unpublish",
			});

			const result = await invokeCliHandler("quartz-syncer:status");
			expect(result.success).toBe(true);
			const data = result.data as {
				deleted: number;
			};
			expect(data.deleted).toBeGreaterThanOrEqual(1);
		});
	});
});
