import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishStatus } from "src/publisher/types";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import { StatusCacheService } from "src/services/StatusCacheService";

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
	const plugin = {
		getPublisher: () => publisher,
		settings: {
			publishTarget: "remote",
			gitRemoteUrl: "https://github.com/example/garden.git",
		},
		statusCache: new StatusCacheService("", ""),
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
	const realRefresh = center["refreshAfterPublish"].bind(center);
	const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
	center["refreshAfterPublish"] = refresh;
	return {
		center,
		realRefresh,
		plugin,
		refresh,
		status,
		controller: center.getController(),
		publisher,
		reload,
		unpublished,
		changed,
	};
}

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
				expect.stringMatching(
					/^✨ 🌱 A little garden growth · \d{4}-\d{2}-\d{2} \d{2}:\d{2} /,
				),
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

describe("Publication Center publish feedback", () => {
	it("times out a stuck refresh, disables stale-data writes and allows refresh recovery", async () => {
		vi.useFakeTimers();
		try {
			const { center, realRefresh, publisher, status } = fixture();
			publisher.getPublishStatus.mockImplementationOnce(
				() => new Promise(() => {}),
			);
			const pending = realRefresh();
			const rejected = expect(pending).rejects.toThrow(
				"Status refresh timed out",
			);
			await vi.advanceTimersByTimeAsync(30000);
			await rejected;
			expect(center["hasFullStatus"]).toBe(false);
			expect(center["isRefreshing"]).toBe(false);
			publisher.getPublishStatus.mockResolvedValue(status);
			center["buildMediaLinksMap"] = vi.fn().mockResolvedValue(undefined);
			await realRefresh();
			expect(center["hasFullStatus"]).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps completion visible, clears successful selections and waits for a fresh list", async () => {
		const { center, controller, refresh, publisher } = fixture();
		let finishRefresh!: () => void;
		refresh.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finishRefresh = resolve;
				}),
		);
		controller.setSelected(["notes/new.md"]);
		const publishing = controller.triggerPublish();
		await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
		expect(center["feedback"]?.phase).toBe("refreshing");
		expect(center["isOperating"]).toBe(true);
		expect(controller.getSelected()).toEqual([]);
		await controller.triggerPublish();
		expect(publisher.publishBatch).toHaveBeenCalledOnce();
		finishRefresh();
		await publishing;
		expect(center["feedback"]?.phase).toBe("success");
		expect(center["feedback"]?.message).toContain("Review list updated");
		expect(center["feedback"]?.message).toContain(
			"deployment runs separately",
		);
		expect(center["isOperating"]).toBe(false);
	});

	it("reports successful publication separately from refresh failure", async () => {
		const { center, controller, refresh } = fixture();
		refresh.mockRejectedValue(new Error("Offline"));
		controller.setSelected(["notes/new.md"]);
		await controller.triggerPublish();
		expect(center["feedback"]?.phase).toBe("warning");
		expect(center["feedback"]?.message).toContain("Published 1 file(s)");
		expect(center["feedback"]?.message).toContain(
			"no need to publish again",
		);
		expect(controller.getSelected()).toEqual([]);
	});

	it("retains skipped selections and displays the reason in the modal", async () => {
		const { center, controller, publisher } = fixture();
		publisher.publishBatch.mockResolvedValue({
			success: true,
			filesPublished: 1,
			filesDeleted: 0,
			failures: [
				{ vaultPath: "notes/changed.md", error: "Missing attachment" },
			],
		});
		controller.setSelected(["notes/new.md", "notes/changed.md"]);
		await controller.triggerPublish();
		expect(controller.getSelected()).toEqual(["notes/changed.md"]);
		expect(center["feedback"]?.phase).toBe("warning");
		expect(center["feedback"]?.message).toContain("Missing attachment");
	});

	it("retains failed selections and reconciles status without retrying a write", async () => {
		const { center, controller, publisher, refresh } = fixture();
		publisher.publishBatch.mockResolvedValue({
			success: false,
			filesPublished: 0,
			filesDeleted: 0,
			error: "Permission denied",
		});
		controller.setSelected(["notes/new.md"]);
		await controller.triggerPublish();
		expect(center["feedback"]?.phase).toBe("error");
		expect(center["feedback"]?.message).toContain("Permission denied");
		expect(controller.getSelected()).toEqual(["notes/new.md"]);
		expect(refresh).toHaveBeenCalledOnce();
		expect(publisher.publishBatch).toHaveBeenCalledOnce();
		expect(center["isOperating"]).toBe(false);
	});

	it("caps preparation progress until upload finishes and preserves 100% after refresh", () => {
		const { center } = fixture();
		const progress = { style: { width: "" }, setAttrs: vi.fn() };
		center["progressIndicatorEl"] = progress as unknown as HTMLDivElement;
		center["progressState"] = { current: 2, total: 2 };
		center["setFeedback"]("publishing", "Uploading…");
		expect(progress.style.width).toBe("90%");
		center["setFeedback"]("refreshing", "Refreshing…");
		expect(progress.style.width).toBe("95%");
		center["setFeedback"]("success", "Published");
		center["progressState"] = { current: 0, total: 0 };
		center["updateProgress"]();
		expect(progress.style.width).toBe("100%");
	});

	it("replaces stale cached status with a fresh post-commit read", async () => {
		const { center, realRefresh, plugin, publisher, status } = fixture();
		center["refreshAfterPublish"] = realRefresh;
		const fresh = {
			...status,
			unpublished: [],
			changed: [],
			published: [
				...status.published,
				...status.unpublished,
				...status.changed,
			],
		};
		plugin.statusCache.setStatus(status);
		plugin.statusCache.setInflight(Promise.resolve(status));
		publisher.getPublishStatus.mockResolvedValue(fresh);
		center["buildMediaLinksMap"] = vi.fn().mockResolvedValue(undefined);
		center["renderShell"] = vi.fn();
		center["startDynamicResolution"] = vi.fn();
		await center["refreshAfterPublish"]();
		expect(publisher.getPublishStatus).toHaveBeenCalledOnce();
		expect(center["status"]).toBe(fresh);
		expect(plugin.statusCache.getStatus()).toBe(fresh);
		expect(center["hasFullStatus"]).toBe(true);
		expect(center["isRefreshing"]).toBe(false);
	});
});
