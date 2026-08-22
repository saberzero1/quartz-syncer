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

describe("Dry-run safety", function () {
	describe("Scenario 16", function () {
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

		it("scenario 16: Publish dry-run produces no side effects", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Target.md",
				readFileSync(join(templateRoot, "Target.md"), "utf-8"),
			);
			await createVaultMarkdown(
				"Draft.md",
				readFileSync(join(templateRoot, "Draft.md"), "utf-8"),
			);
			const beforeTree = fixture.getFileTree();

			const result = await invokeCliHandler("quartz-syncer:publish", {}, [
				"dry-run",
			]);
			expect(result.success).toBe(true);

			await assertions.fileTreeUnchanged(beforeTree);
		});
	});

	describe("Scenario 17-18", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const publishPaths = ["Alpha.md", "Beta.md"];

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
			await cleanupVault(publishPaths);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(publishPaths);
			await fixture.destroy();
		});

		it("scenario 17: Delete dry-run produces no side effects", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Alpha.md",
				"---\ntitle: Alpha\npublish: true\n---\nAlpha note.",
			);
			await createVaultMarkdown(
				"Beta.md",
				"---\ntitle: Beta\npublish: true\n---\nBeta note.",
			);
			await invokeCliHandler("quartz-syncer:publish");
			await invokeCliHandler("quartz-syncer:mark", {
				path: "Beta.md",
				state: "unpublish",
			});
			const beforeTree = fixture.getFileTree();

			const result = await invokeCliHandler("quartz-syncer:delete", {}, [
				"force",
				"dry-run",
			]);
			expect(result.success).toBe(true);

			await assertions.fileTreeUnchanged(beforeTree);
		});

		it("scenario 18: Sync dry-run produces no side effects", async function (this: TestContext) {
			this.timeout(30000);
			await createVaultMarkdown(
				"Alpha.md",
				"---\ntitle: Alpha\npublish: true\n---\nAlpha note.",
			);
			await createVaultMarkdown(
				"Beta.md",
				"---\ntitle: Beta\npublish: true\n---\nBeta note.",
			);
			await invokeCliHandler("quartz-syncer:publish");
			await invokeCliHandler("quartz-syncer:mark", {
				path: "Beta.md",
				state: "unpublish",
			});
			const beforeTree = fixture.getFileTree();

			const result = await invokeCliHandler("quartz-syncer:sync", {}, [
				"force",
				"dry-run",
			]);
			expect(result.success).toBe(true);

			await assertions.fileTreeUnchanged(beforeTree);
		});
	});

	describe("Scenario 19", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;

		before(async function () {
			fixturePath = await fixture.create("multi-plugin");
			assertions = new RepoAssertions(fixture);
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
		});

		beforeEach(async function () {
			await fixture.reset();
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await fixture.destroy();
		});

		it("scenario 19: Plugin list dry-run produces no side effects", async function () {
			const before = fixture.readFile("quartz.config.yaml");
			const beforeTree = fixture.getFileTree();

			const result = await invokeCliHandler(
				"quartz-syncer:plugin",
				{
					action: "list",
				},
				["dry-run"],
			);
			expect(result.success).toBe(true);

			const after = fixture.readFile("quartz.config.yaml");
			expect(after).toBe(before);
			await assertions.fileTreeUnchanged(beforeTree);
		});
	});
});
