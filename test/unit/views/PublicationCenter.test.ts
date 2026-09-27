import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishStatus } from "src/publisher/types";
import { StatusCacheService } from "src/services/StatusCacheService";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";

function note(path: string): PublishFile {
	return { getVaultPath: () => path } as PublishFile;
}

function fixture() {
	const unpublished = note("notes/new.md");
	const changed = note("notes/changed.md");
	const published = [
		note("notes/published-a.md"),
		note("notes/published-b.md"),
		note("notes/published-unselected.md"),
	];
	const status: PublishStatus = {
		unpublished: [unpublished],
		changed: [changed],
		published,
		deleted: ["notes/deleted-a.md", "notes/deleted-b.md"],
		media: [
			{
				vaultPath: "attachments/linked.png",
				repoPath: "content/assets/linked.png",
				sha: "linked-sha",
				linked: true,
			},
			{
				vaultPath: "attachments/unlinked.png",
				repoPath: "content/assets/unlinked.png",
				sha: "unlinked-sha",
				linked: false,
			},
		],
		arbitrary: [],
	};
	const publisher = {
		getPublishStatus: vi
			.fn<Publisher["getPublishStatus"]>()
			.mockResolvedValue(status),
		publishBatch: vi.fn<Publisher["publishBatch"]>().mockResolvedValue({
			success: true,
			filesPublished: 1,
			filesDeleted: 0,
		}),
		deleteBatch: vi.fn<Publisher["deleteBatch"]>().mockResolvedValue({
			success: true,
			filesPublished: 0,
			filesDeleted: 1,
		}),
		deleteByRepoPaths: vi
			.fn<Publisher["deleteByRepoPaths"]>()
			.mockResolvedValue({
				success: true,
				filesPublished: 0,
				filesDeleted: 1,
			}),
		publishArbitraryFiles: vi.fn<Publisher["publishArbitraryFiles"]>(),
	};
	const statusCache = new StatusCacheService("", "");
	const plugin = {
		getPublisher: vi.fn(() => publisher),
		statusCache,
	} as unknown as QuartzSyncer;
	const center = new PublicationCenter({} as App, plugin);

	// Seed the state normally supplied by status loading / tree rendering.
	// The existing Modal mock has no DOM attributes or event dispatch. Exercise
	// the public controller's real button handlers, not a copy of their filters.
	center["status"] = status;
	center["hasFullStatus"] = true;
	center["buildFileMap"]();
	center["treeState"].setEntries([
		{ path: unpublished.getVaultPath(), category: "unpublished" },
		{ path: changed.getVaultPath(), category: "changed" },
		...published.map((file) => ({
			path: file.getVaultPath(),
			category: "published" as const,
		})),
		...status.deleted.map((path) => ({
			path,
			category: "deleted" as const,
		})),
		{ path: "attachments/linked.png", category: "media-linked" },
		{ path: "attachments/unlinked.png", category: "media-unlinked" },
	]);
	// Do not render or fetch another status after a successful operation.
	const reload = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
	center["loadStatus"] = reload;
	return {
		center,
		plugin,
		status,
		statusCache,
		controller: center.getController(),
		publisher,
		reload,
		unpublished,
		changed,
	};
}

function statusFixture() {
	const context = fixture();
	context.center["loadStatus"] = PublicationCenter.prototype["loadStatus"];
	// Keep the real async loading logic, without mounting a tree in Node.
	context.center["renderShell"] = vi.fn();
	context.center["buildMediaLinksMap"] = vi.fn().mockResolvedValue(undefined);
	return context;
}

describe("Publication Center status loading", () => {
	it("keeps tree categories in sync when dynamic classification resolves", () => {
		const { center, status, changed } = fixture();
		const path = changed.getVaultPath();
		status.dynamic = new Set([path]);
		center["treeState"].selectFile(path);

		center["applyResolvedClassification"](path, true);

		expect(status.changed).not.toContain(changed);
		expect(status.published).toContain(changed);
		expect(status.dynamic.has(path)).toBe(false);
		expect(center["treeState"].getCategory(path)).toBe("published");
		expect(center["treeState"].getSelectedCount("changed")).toBe(0);
		expect(center["treeState"].getSelectedCount("published")).toBe(1);
	});

	it("distinguishes a failed status load from an unconfigured publisher and recovers on retry", async () => {
		const { center, plugin, publisher } = statusFixture();
		const failure = new Error("Status fetch failed");
		publisher.getPublishStatus.mockRejectedValueOnce(failure);

		await center["loadStatus"]();

		expect(center["statusLoadState"]).toEqual({
			kind: "error",
			message: failure.message,
		});

		await center["loadStatus"]();
		expect(center["statusLoadState"].kind).toBe("ready");

		vi.spyOn(plugin, "getPublisher").mockReturnValue(null);
		await center["loadStatus"]();
		expect(center["statusLoadState"].kind).toBe("unconfigured");
	});

	it("keeps the current status when loadStatus resolves for a stale destination", async () => {
		const { center, publisher, status, statusCache } = statusFixture();
		let resolveStatus: ((status: PublishStatus) => void) | undefined;
		publisher.getPublishStatus.mockReturnValue(
			new Promise((resolve) => {
				resolveStatus = resolve;
			}),
		);
		statusCache.setDestination("local:/quartz");

		const loading = center["loadStatus"]();
		statusCache.setDestination("remote:https://example.com/quartz.git#v5");
		resolveStatus?.({ ...status, changed: [] });
		await loading;

		expect(publisher.getPublishStatus).toHaveBeenCalledOnce();
		expect(center["status"]).toBe(status);
		expect(statusCache.getStatus()).toBeNull();
	});

	it("keeps the current status when a background refresh resolves for a stale destination", async () => {
		const { center, plugin, publisher, status, statusCache } =
			statusFixture();
		let resolveStatus: ((status: PublishStatus) => void) | undefined;
		publisher.getPublishStatus.mockReturnValue(
			new Promise((resolve) => {
				resolveStatus = resolve;
			}),
		);
		statusCache.setDestination("local:/quartz");
		const source = plugin.getPublisher();
		if (!source) throw new Error("Expected configured publisher");

		const refreshing = center["refreshStatusInBackground"](source);
		statusCache.setDestination("remote:https://example.com/quartz.git#v5");
		resolveStatus?.({ ...status, changed: [] });
		await refreshing;

		expect(publisher.getPublishStatus).toHaveBeenCalledOnce();
		expect(center["status"]).toBe(status);
		expect(statusCache.getStatus()).toBeNull();
	});
});

describe("Publication Center category-to-button routing", () => {
	it.each([
		["published", ["notes/published-a.md", "notes/published-b.md"]],
		["deleted", ["notes/deleted-a.md", "notes/deleted-b.md"]],
	] as const)(
		"the delete button unpublishes selected %s notes using exactly their vault paths",
		async (_category, paths) => {
			const { controller, publisher } = fixture();
			controller.setSelected([...paths]);
			expect(controller.getSelected()).toEqual(paths);

			await controller.triggerDelete();

			expect(publisher.deleteBatch).toHaveBeenCalledExactlyOnceWith(
				paths,
				"Deleted via Quartz Syncer",
				expect.any(Function),
			);
			expect(publisher.deleteByRepoPaths).not.toHaveBeenCalled();
			expect(publisher.publishBatch).not.toHaveBeenCalled();
		},
	);

	it("published files are unpublished via the delete button, not the publish button (intentional no-op)", async () => {
		const { controller, publisher, reload } = fixture();
		controller.setSelected(["notes/published-a.md"]);
		expect(controller.getSelected()).toEqual(["notes/published-a.md"]);

		await controller.triggerPublish();

		expect(publisher.publishBatch).not.toHaveBeenCalled();
		expect(publisher.publishArbitraryFiles).not.toHaveBeenCalled();
		expect(publisher.deleteBatch).not.toHaveBeenCalled();
		expect(publisher.deleteByRepoPaths).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it.each(["unpublished", "changed"] as const)(
		"the publish button publishes only the %s note in a mixed selection with a published note",
		async (category) => {
			const context = fixture();
			const { controller, publisher } = context;
			const file = context[category];
			controller.setSelected([
				file.getVaultPath(),
				"notes/published-a.md",
			]);

			await controller.triggerPublish();

			expect(publisher.publishBatch).toHaveBeenCalledExactlyOnceWith(
				[file],
				"Published via Quartz Syncer",
				expect.any(Function),
			);
			expect(publisher.deleteBatch).not.toHaveBeenCalled();
			expect(publisher.deleteByRepoPaths).not.toHaveBeenCalled();
			expect(publisher.publishArbitraryFiles).not.toHaveBeenCalled();
		},
	);

	it.each(["unpublished", "changed"] as const)(
		"the delete button unpublishes only the published note when mixed with %s notes",
		async (category) => {
			const context = fixture();
			const { controller, publisher } = context;
			controller.setSelected([
				context[category].getVaultPath(),
				"notes/published-a.md",
			]);

			await controller.triggerDelete();

			expect(publisher.deleteBatch).toHaveBeenCalledExactlyOnceWith(
				["notes/published-a.md"],
				"Deleted via Quartz Syncer",
				expect.any(Function),
			);
			expect(publisher.deleteByRepoPaths).not.toHaveBeenCalled();
			expect(publisher.publishBatch).not.toHaveBeenCalled();
		},
	);

	it.each(["linked", "unlinked"])(
		"the delete button removes media-%s via repository paths, never the vault-path deletion API",
		async (kind) => {
			const { controller, publisher } = fixture();
			controller.setSelected([`attachments/${kind}.png`]);
			expect(controller.getSelected()).toEqual([
				`attachments/${kind}.png`,
			]);

			await controller.triggerDelete();

			expect(publisher.deleteByRepoPaths).toHaveBeenCalledExactlyOnceWith(
				[`content/assets/${kind}.png`],
				"Deleted via Quartz Syncer",
				expect.any(Function),
			);
			expect(publisher.deleteBatch).not.toHaveBeenCalled();
			expect(publisher.publishBatch).not.toHaveBeenCalled();
		},
	);
});
