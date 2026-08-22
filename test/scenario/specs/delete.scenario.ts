import { browser, expect } from "@wdio/globals";

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

describe("Delete safety", function () {
	const fixture = new FixtureManager();
	let assertions: RepoAssertions;
	let fixturePath: string;
	const publishPaths = ["Alpha.md", "Beta.md", "Gamma.md"];

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

	it("scenario 13: Delete removes only specified files", async function (this: TestContext) {
		this.timeout(30000);
		await createVaultMarkdown(
			"Alpha.md",
			"---\ntitle: Alpha\npublish: true\n---\nAlpha note.",
		);
		await createVaultMarkdown(
			"Beta.md",
			"---\ntitle: Beta\npublish: true\n---\nBeta note.",
		);
		await createVaultMarkdown(
			"Gamma.md",
			"---\ntitle: Gamma\npublish: true\n---\nGamma note.",
		);
		await invokeCliHandler("quartz-syncer:publish");
		await invokeCliHandler("quartz-syncer:mark", {
			path: "Beta.md",
			state: "unpublish",
		});

		const result = await invokeCliHandler("quartz-syncer:delete", {}, [
			"force",
		]);
		expect(result.success).toBe(true);

		assertions.fileExists("content/Alpha.md");
		assertions.fileNotExists("content/Beta.md");
		assertions.fileExists("content/Gamma.md");
	});

	it("scenario 14: Delete doesn't touch non-content files", async function (this: TestContext) {
		this.timeout(30000);
		const configBefore = fixture.readFile("quartz.config.yaml");
		const cssBefore = fixture.readFile("quartz/styles/custom.scss");

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

		const result = await invokeCliHandler("quartz-syncer:delete", {}, [
			"force",
		]);
		expect(result.success).toBe(true);

		const configAfter = fixture.readFile("quartz.config.yaml");
		const cssAfter = fixture.readFile("quartz/styles/custom.scss");
		expect(configAfter).toBe(configBefore);
		expect(cssAfter).toBe(cssBefore);
	});

	it("scenario 15: Delete without force is rejected", async function (this: TestContext) {
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

		const result = await invokeCliHandler("quartz-syncer:delete");
		expect(result.success).toBe(false);

		await assertions.fileTreeUnchanged(beforeTree);
	});
});
