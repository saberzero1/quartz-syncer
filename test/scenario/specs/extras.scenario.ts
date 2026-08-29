import { browser, expect } from "@wdio/globals";
import { readFileSync, readdirSync, writeFileSync } from "fs";
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

describe("Extras", function () {
	describe("Scenario 39", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const bulkPaths: string[] = [];

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
			await cleanupVault(bulkPaths);
			bulkPaths.length = 0;
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await cleanupVault(bulkPaths);
			await fixture.destroy();
		});

		it("scenario 39: Bulk publish (50+ files) completes within 30 seconds", async function (this: TestContext) {
			this.timeout(30000);
			const bulkDir = join(templateRoot, "bulk");
			const files = readdirSync(bulkDir).filter((file) =>
				file.endsWith(".md"),
			);
			await ensureFolder("notes");
			for (const file of files) {
				const content = readFileSync(join(bulkDir, file), "utf-8");
				const path = `notes/${file}`;
				bulkPaths.push(path);
				await createVaultMarkdown(path, content);
			}

			const startedAt = Date.now();
			const result = await invokeCliHandler("quartz-syncer:publish");
			const duration = Date.now() - startedAt;
			expect(result.success).toBe(true);
			expect(duration).toBeLessThanOrEqual(30000);
			assertions.fileExists(`content/${bulkPaths[0]}`);
		});
	});

	describe("Scenario 40-41", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;

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
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await fixture.destroy();
		});

		it("scenario 40: Validate command detects broken config", async function () {
			writeFileSync(
				fixture.filePath("quartz.config.yaml"),
				"configuration: [",
			);
			const result = await invokeCliHandler("quartz-syncer:validate");
			expect(result.success).toBe(false);
		});

		it("scenario 41: Validate command passes on healthy repo", async function () {
			const beforeTree = fixture.getFileTree();
			const result = await invokeCliHandler("quartz-syncer:validate");
			expect(result.success).toBe(true);
			const data = result.data as { valid?: boolean } | undefined;
			expect(data?.valid).toBe(true);
			await assertions.fileTreeUnchanged(beforeTree);
		});
	});

	describe("Scenario 42", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;
		const templatePaths = ["Target.md"];

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

		it("scenario 42: Cache clear and status roundtrip works", async function (this: TestContext) {
			this.timeout(30000);
			const content = readFileSync(
				join(templateRoot, "basic", "Target.md"),
				"utf-8",
			);
			await createVaultMarkdown("Target.md", content);
			await invokeCliHandler("quartz-syncer:publish");

			const statusBefore = await invokeCliHandler("quartz-syncer:cache", {
				action: "status",
			});
			expect(statusBefore.success).toBe(true);

			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });

			const statusAfter = await invokeCliHandler("quartz-syncer:cache", {
				action: "status",
			});
			expect(statusAfter.success).toBe(true);
			const data = statusAfter.data as { entries: number };
			expect(data.entries).toBe(0);
		});
	});

	describe("Scenario 43-44", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;

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
			await invokeCliHandler("quartz-syncer:repo", {
				action: "set-local",
				path: fixturePath,
			});
			await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
		});

		after(async function () {
			await fixture.destroy();
		});

		it("scenario 43: Repo info shows correct mode (local/remote)", async function () {
			const beforeTree = fixture.getFileTree();
			const result = await invokeCliHandler("quartz-syncer:repo", {
				action: "info",
			});
			expect(result.success).toBe(true);
			const data = result.data as {
				mode?: string;
				localPath?: string | null;
			};
			expect(data.mode).toBe("local");
			expect(data.localPath).toBe(fixturePath);
			await assertions.fileTreeUnchanged(beforeTree);
		});

		it("scenario 44: Repo verify rejects invalid paths", async function () {
			const result = await invokeCliHandler("quartz-syncer:repo", {
				action: "verify",
				path: "/not/a/real/path",
			});
			expect(result.success).toBe(false);
		});
	});
});
