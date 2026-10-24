import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, MetadataCache, Platform, TFile, Vault } from "obsidian";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import { DataStore } from "src/cache/DataStore";
import type QuartzSyncerSettings from "src/models/settings";
import { PublishFile } from "src/publishFile/PublishFile";
import { LocalPublishBackend } from "src/publisher/LocalPublishBackend";
import { createTempRepo, cleanupTempRepo } from "./helpers";

vi.mock("src/cache/DataStore");

const requireFn = createRequire(import.meta.url);
const markers = [
	"%% tabs %%",
	"%% tab: First %%",
	"%% cols %%",
	"%% col %%",
	"%% col %%",
	"%% endcols %%",
	"%% tab: Second %%",
	"%% endtabs %%",
];
const opaqueComment =
	"%%\nPrivate Unicode: Привіт\n![[Home/Secret.png]]\n![[Home/Shared.png]]\n[[Home/Other|alias]]\n| a | [[Home/Other|label]] |\n> [!note] untouched\n%%";
const source = [
	"---",
	"publish: true",
	"---",
	"",
	markers[0],
	markers[1],
	markers[2],
	markers[3],
	"First column.",
	markers[4],
	"Second column.",
	markers[5],
	markers[6],
	"Second tab.",
	markers[7],
	"",
	opaqueComment,
	"",
	"> [!note] Visible callout",
	"> Visible content.",
	"",
	"[[Home/Other|Visible link]]",
	"![[Home/Shared.png]]",
	"",
].join("\n");

beforeEach(() => {
	Platform.isDesktopApp = true;
	const runtime = globalThis as unknown as {
		require?: (module: string) => unknown;
		window?: unknown;
	};
	runtime.window = globalThis;
	runtime.require = requireFn;
});

describe("Comment preservation through local publication", () => {
	it("republishes unchanged source as Remove → Preserve → Remove", async () => {
		const repo = await createTempRepo();
		try {
			const sourcePath = join(repo, "vault/Home/Layout.md");
			await mkdir(join(repo, "vault/Home"), { recursive: true });
			await writeFile(sourcePath, source);
			const before = await stat(sourcePath);
			const beforeHash = createHash("sha256")
				.update(source)
				.digest("hex");
			const settings = {
				obsidianCommentMode: "remove",
				publishFrontmatterKey: "publish",
				frontmatterFormat: "yaml",
				contentFolder: "content",
				createdTimestampKey: "created",
				updatedTimestampKey: "updated",
				publishedTimestampKey: "published",
				timestampFormat: "YYYY-MM-DD",
				usePermalink: false,
				includeAllFrontmatter: false,
				vaultPath: "Home/",
				useCache: false,
				useDataview: false,
				showCreatedTimestamp: false,
				showUpdatedTimestamp: false,
				showPublishedTimestamp: false,
			} as QuartzSyncerSettings;
			const vault = new Vault();
			vi.spyOn(vault, "cachedRead").mockImplementation(() =>
				readFile(sourcePath, "utf8"),
			);
			const metadata = new MetadataCache();
			const embeds = [...source.matchAll(/!\[\[([^\]]+)\]\]/g)].map(
				(match) => {
					const offset = match.index;
					return {
						link: match[1]!,
						original: match[0],
						position: {
							start: {
								offset,
								line:
									source.slice(0, offset).split("\n").length -
									1,
								col: 0,
							},
							end: {
								offset: offset + match[0].length,
								line:
									source.slice(0, offset).split("\n").length -
									1,
								col: match[0].length,
							},
						},
					};
				},
			);
			vi.spyOn(metadata, "getCache").mockReturnValue({
				frontmatter: { publish: true },
				embeds,
			});
			vi.spyOn(metadata, "getFirstLinkpathDest").mockImplementation(
				(path) =>
					path.endsWith(".png")
						? Object.assign(new TFile(), {
								path,
								extension: "png",
								name: path.split("/").at(-1),
							})
						: null,
			);
			vi.spyOn(metadata, "fileToLinktext").mockImplementation(
				(file) => file.path,
			);
			const file = Object.assign(new TFile(), {
				path: "Home/Layout.md",
				name: "Layout.md",
				basename: "Layout",
				extension: "md",
				stat: {
					mtime: before.mtimeMs,
					ctime: before.ctimeMs,
					size: before.size,
				},
			});
			const compiler = new SyncerPageCompiler(
				new App(),
				vault,
				settings,
				metadata,
				{} as DataStore,
			);
			const note = new PublishFile({
				file,
				compiler,
				metadataCache: metadata,
				vault,
				settings,
				datastore: {} as DataStore,
			});
			const backend = new LocalPublishBackend(join(repo, "quartz"));
			expect(note.shouldPublish()).toBe(true);
			expect(settings.obsidianCommentMode).toBe("remove");

			for (const mode of ["remove", "preserve", "remove"] as const) {
				settings.obsidianCommentMode = mode;
				const [compiled, assets] =
					await compiler.generateMarkdown(note);
				if (mode === "preserve") {
					expect(
						assets.blobs.map((asset) => asset.vaultPath),
					).toEqual(["Home/Shared.png"]);
				}
				await backend.writeFiles("main", "Local comment fixture", [
					{ path: "content/Layout.md", content: compiled },
				]);
				const published = await readFile(
					join(repo, "quartz/content/Layout.md"),
					"utf8",
				);
				if (mode === "preserve") {
					let cursor = 0;
					for (const marker of markers) {
						const position = published.indexOf(marker, cursor);
						expect(position).toBeGreaterThanOrEqual(cursor);
						cursor = position + marker.length;
					}
					expect(published).toContain(opaqueComment);
				} else {
					expect(published).not.toContain("%%");
					expect(published).not.toContain("Private Unicode");
				}
				expect(published).toContain("First column.");
				expect(published).toContain("Second tab.");
				expect(published).toContain("> [!note] Visible callout");
				expect(published).toContain("[[Other|Visible link]]");
				expect(
					createHash("sha256")
						.update(await readFile(sourcePath))
						.digest("hex"),
				).toBe(beforeHash);
				expect((await stat(sourcePath)).mtimeMs).toBe(before.mtimeMs);
			}
		} finally {
			await cleanupTempRepo(repo);
		}
	});
});
