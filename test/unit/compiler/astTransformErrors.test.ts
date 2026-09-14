import { describe, expect, it, vi } from "vitest";
import { App, MetadataCache, Vault } from "obsidian";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import type QuartzSyncerSettings from "src/models/settings";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { DataStore } from "src/cache/DataStore";

vi.mock("src/cache/DataStore");

vi.mock("@quartz-community/remark-obsidian", () => ({
	default: () => () => {
		throw new Error("synthetic tokenizer failure");
	},
}));

const makeCompiler = () =>
	new SyncerPageCompiler(
		new App(),
		new Vault(),
		{ vaultPath: "/" } as QuartzSyncerSettings,
		new MetadataCache(),
		{} as DataStore,
	);

const makeFile = (path: string): PublishFile =>
	({ getVaultPath: () => path }) as unknown as PublishFile;

describe("astTransform error reporting", () => {
	it("attributes a transform failure to the offending note", async () => {
		const compiler = makeCompiler();

		await expect(
			compiler.astTransform(makeFile("notes/broken.md"))("text"),
		).rejects.toThrow(
			'Markdown transform failed for "notes/broken.md": synthetic tokenizer failure',
		);
	});

	it("names the specific file so a batch failure is actionable", async () => {
		const compiler = makeCompiler();

		await expect(
			compiler.astTransform(makeFile("campaign/session 12.md"))("text"),
		).rejects.toThrow(/campaign\/session 12\.md/);
	});
});
