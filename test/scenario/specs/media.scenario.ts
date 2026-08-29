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
	"../vault-templates/media-heavy",
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

describe("Media handling", function () {
	const fixture = new FixtureManager();
	let assertions: RepoAssertions;
	let fixturePath: string;
	const vaultPaths = ["Photo Post.md", "images/test-image.png"];

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

	async function publishMediaNote(): Promise<void> {
		await createVaultMarkdown(
			"Photo Post.md",
			readFileSync(join(templateRoot, "Photo Post.md"), "utf-8"),
		);
		const imageBase64 = readFileSync(
			join(templateRoot, "images", "test-image.png"),
		).toString("base64");
		await createVaultBinary("images/test-image.png", imageBase64);
		await invokeCliHandler("quartz-syncer:publish");
	}

	it("scenario 32: Orphaned media detected correctly", async function (this: TestContext) {
		this.timeout(30000);
		await publishMediaNote();
		await deleteVaultPath("Photo Post.md");

		const result = await invokeCliHandler("quartz-syncer:media", {
			action: "orphaned",
		});
		expect(result.success).toBe(true);
		const data = result.data as { files: Array<{ path: string }> };
		expect(
			data.files.some((file) => file.path.includes("test-image.png")),
		).toBe(true);
	});

	it("scenario 33: Orphaned media cleanup removes only unlinked files", async function (this: TestContext) {
		this.timeout(30000);
		await publishMediaNote();

		assertions.fileExists("content/images/test-image.png");

		await deleteVaultPath("Photo Post.md");

		const result = await invokeCliHandler(
			"quartz-syncer:media",
			{
				action: "clean",
			},
			["force"],
		);
		expect(result.success).toBe(true);

		const data = result.data as { cleaned: number } | undefined;
		expect(data?.cleaned).toBeGreaterThan(0);
	});

	it("scenario 34: Media cleanup dry-run is safe", async function (this: TestContext) {
		this.timeout(30000);
		await publishMediaNote();
		await deleteVaultPath("Photo Post.md");
		const beforeTree = fixture.getFileTree();

		const result = await invokeCliHandler(
			"quartz-syncer:media",
			{ action: "clean" },
			["force", "dry-run"],
		);
		expect(result.success).toBe(true);

		await assertions.fileTreeUnchanged(beforeTree);
	});
});
