import { browser, expect } from "@wdio/globals";
import { readFileSync, readdirSync } from "fs";
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
			const existing = app.vault.getAbstractFileByPath(path);
			if (!existing) {
				await app.vault.create(path, content);
			}
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

describe("Mark command", function () {
	const fixture = new FixtureManager();
	let assertions: RepoAssertions;
	let fixturePath: string;
	const basicPaths = [
		"Target.md",
		"Draft.md",
		"Unset.md",
		"NoFrontmatter.md",
	];

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

	it("scenario 28: Mark sets publish flag", async function () {
		await createVaultMarkdown(
			"Unset.md",
			readFileSync(join(templateRoot, "basic", "Unset.md"), "utf-8"),
		);
		const result = await invokeCliHandler("quartz-syncer:mark", {
			path: "Unset.md",
			state: "publish",
		});
		expect(result.success).toBe(true);

		const content = await readVaultFile("Unset.md");
		expect(content).toContain("publish: true");
	});

	it("scenario 29: Mark unsets publish flag", async function () {
		await createVaultMarkdown(
			"Target.md",
			readFileSync(join(templateRoot, "basic", "Target.md"), "utf-8"),
		);
		const result = await invokeCliHandler("quartz-syncer:mark", {
			path: "Target.md",
			state: "unpublish",
		});
		expect(result.success).toBe(true);

		const content = await readVaultFile("Target.md");
		expect(content).toContain("publish: false");
	});

	it("scenario 30: Mark with glob matches multiple files", async function () {
		await ensureFolder("notes");
		await createVaultMarkdown(
			"notes/globA.md",
			"---\ntitle: A\n---\nNote A.",
		);
		await createVaultMarkdown(
			"notes/globB.md",
			"---\ntitle: B\n---\nNote B.",
		);
		await createVaultMarkdown(
			"notes/globC.md",
			"---\ntitle: C\n---\nNote C.",
		);

		const result = await invokeCliHandler("quartz-syncer:mark", {
			path: "notes/*.md",
			state: "publish",
		});
		expect(result.success).toBe(true);

		const contentA = await readVaultFile("notes/globA.md");
		const contentB = await readVaultFile("notes/globB.md");
		const contentC = await readVaultFile("notes/globC.md");
		expect(contentA).toContain("publish: true");
		expect(contentB).toContain("publish: true");
		expect(contentC).toContain("publish: true");

		await cleanupVault([
			"notes/globA.md",
			"notes/globB.md",
			"notes/globC.md",
		]);
	});

	it("scenario 31: Mark dry-run doesn't modify files", async function () {
		await createVaultMarkdown(
			"Target.md",
			readFileSync(join(templateRoot, "basic", "Target.md"), "utf-8"),
		);
		const before = await readVaultFile("Target.md");
		const beforeTree = fixture.getFileTree();

		const result = await invokeCliHandler(
			"quartz-syncer:mark",
			{ path: "Target.md", state: "publish" },
			["dry-run"],
		);
		expect(result.success).toBe(true);

		const after = await readVaultFile("Target.md");
		expect(after).toBe(before);
		await assertions.fileTreeUnchanged(beforeTree);
	});
});
