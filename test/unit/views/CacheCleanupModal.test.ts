import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type QuartzSyncer from "src/main";
import { CacheCleanupModal } from "src/views/CacheCleanupModal";
import { performanceSettingDefinitions } from "src/views/settings/PerformanceSettings";
import type { CacheMaintenanceService } from "src/services/CacheMaintenanceService";

const { Element, notice, opened } = vi.hoisted(() => {
	class Element {
		children: Element[] = [];
		attrs: Record<string, string> = {};
		disabled = false;
		text = "";
		cls = "";
		click = () => {};
		createEl(_tag: string, options: { text?: string; cls?: string } = {}) {
			const child = new Element();
			child.text = options.text ?? "";
			child.cls = options.cls ?? "";
			this.children.push(child);
			return child;
		}
		createDiv(options: { cls?: string }) {
			return this.createEl("div", options);
		}
		setText(text: string) {
			this.text = text;
		}
		setAttrs(attrs: Record<string, string>) {
			Object.assign(this.attrs, attrs);
		}
		empty() {
			this.children = [];
		}
		addEventListener(_event: string, callback: () => void) {
			this.click = callback;
		}
		find(role: string): Element[] {
			return [
				...(this.attrs["data-qs"] === role ? [this] : []),
				...this.children.flatMap((child) => child.find(role)),
			];
		}
	}
	return { Element, notice: vi.fn(), opened: vi.fn() };
});

vi.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	Modal: class {
		modalEl = new Element();
		contentEl = new Element();
		titleEl = new Element();
		onOpen() {}
		onClose() {}
		open() {
			opened();
			this.onOpen();
		}
		close() {
			this.onClose();
		}
	},
	Notice: class {
		constructor(message: string) {
			notice(message);
		}
	},
}));

function fixture(names: string[] = ["foreign-quartz-syncer-status"]) {
	const survey = vi
		.fn<CacheMaintenanceService["survey"]>()
		.mockResolvedValue({ names });
	const drop = vi
		.fn<CacheMaintenanceService["drop"]>()
		.mockResolvedValue({ dropped: [...names], failed: [] });
	const emit = vi.fn();
	const plugin = {
		app: {},
		settings: { useCache: true },
		cacheMaintenance: { survey, drop },
		getEventSink: () => ({ emit }),
	} as unknown as QuartzSyncer;
	const modal = new CacheCleanupModal(plugin);
	const content = modal.contentEl as unknown as InstanceType<typeof Element>;
	const root = modal.modalEl as unknown as InstanceType<typeof Element>;
	return { modal, content, root, plugin, survey, drop, emit };
}

function required(content: InstanceType<typeof Element>, role: string) {
	const element = content.find(role)[0];
	if (!element) throw new Error(`Missing ${role}`);
	return element;
}

describe("CacheCleanupModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("loads a read-only survey, renders exact names as text, and emits lifecycle events", async () => {
		const names = [
			"quartz-syncer/cache/Second Brain/quartz-syncer/1.18.0",
			"<b>foreign</b>-quartz-syncer-status",
		];
		const { modal, content, root, survey, drop, emit } = fixture(names);
		modal.onOpen();
		expect(content.children[0]?.text).toBe("Looking for cached databases…");
		expect(content.find("cache-cleanup-confirm")).toEqual([]);
		await Promise.resolve();
		expect(root.attrs["data-qs"]).toBe("cache-cleanup");
		expect(
			content
				.find("cache-cleanup-item")
				.map((el) => [el.text, el.attrs["data-qs-name"]]),
		).toEqual(names.map((name) => [name, name]));
		expect(required(content, "cache-cleanup-confirm").text).toBe(
			"Delete 2 databases",
		);
		expect(required(content, "cache-cleanup-confirm").cls).toBe(
			"mod-warning",
		);
		expect(content.children[0]?.text).toContain("No notes are affected");
		expect(survey).toHaveBeenCalledTimes(1);
		expect(drop).not.toHaveBeenCalled();
		required(content, "cache-cleanup-cancel").click();
		expect(content.children).toEqual([]);
		expect(emit.mock.calls).toEqual([
			["ui.modal.opened", { name: "cache-cleanup" }],
			["ui.modal.closed", { name: "cache-cleanup" }],
		]);
	});

	it("shows only a close button for an empty survey", async () => {
		const { modal, content, drop } = fixture([]);
		modal.onOpen();
		await Promise.resolve();
		expect(required(content, "cache-cleanup-empty").text).toBe(
			"There are no caches to clean up.",
		);
		expect(required(content, "cache-cleanup-cancel").text).toBe("Close");
		expect(content.find("cache-cleanup-confirm")).toEqual([]);
		expect(drop).not.toHaveBeenCalled();
	});

	it("disables both buttons, ignores double clicks, and deletes only the reviewed snapshot", async () => {
		const { modal, content, survey, drop } = fixture();
		let release = () => {};
		drop.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = () =>
						resolve({
							dropped: ["foreign-quartz-syncer-status"],
							failed: [],
						});
				}),
		);
		modal.onOpen();
		await Promise.resolve();
		const confirm = required(content, "cache-cleanup-confirm");
		const cancel = required(content, "cache-cleanup-cancel");
		expect(confirm.text).toBe("Delete 1 database");
		survey.mockResolvedValue({
			names: ["new-unreviewed-quartz-syncer-status"],
		});
		confirm.click();
		confirm.click();
		cancel.click();
		expect(confirm.disabled).toBe(true);
		expect(cancel.disabled).toBe(true);
		expect(content.children.length).toBeGreaterThan(0);
		expect(survey).toHaveBeenCalledTimes(1);
		expect(drop).toHaveBeenCalledExactlyOnceWith([
			"foreign-quartz-syncer-status",
		]);
		release();
		await Promise.resolve();
		expect(content.children).toEqual([]);
		expect(notice).toHaveBeenCalledExactlyOnceWith(
			"Reclaimed 1 cached database.",
		);
	});

	it("reports reclaimed counts and failures", async () => {
		const { modal, content, drop } = fixture();
		drop.mockResolvedValue({
			dropped: [],
			failed: ["foreign-quartz-syncer-status"],
		});
		modal.onOpen();
		await Promise.resolve();
		required(content, "cache-cleanup-confirm").click();
		await Promise.resolve();
		expect(notice).toHaveBeenCalledExactlyOnceWith(
			"Reclaimed 0 cached databases. Failed to delete 1.",
		);
	});

	it("offers no delete action if enumeration fails", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => {});
		const { modal, content, survey, drop } = fixture();
		survey.mockRejectedValue(new Error("Denied"));
		modal.onOpen();
		await Promise.resolve();
		expect(content.children[0]?.text).toBe(
			"Could not list cached databases. No caches were deleted.",
		);
		expect(required(content, "cache-cleanup-cancel").text).toBe("Close");
		expect(content.find("cache-cleanup-confirm")).toEqual([]);
		expect(drop).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"does not repopulate a closed modal when the survey settles (rejected=%s)",
		async (reject) => {
			const { modal, content, survey } = fixture();
			let settle = () => {};
			survey.mockImplementationOnce(
				() =>
					new Promise((resolve, fail) => {
						settle = () =>
							reject
								? fail(new Error("Late failure"))
								: resolve({
										names: ["foreign-quartz-syncer-status"],
									});
					}),
			);
			modal.onOpen();
			modal.onClose();
			settle();
			await Promise.resolve();
			expect(content.children).toEqual([]);
		},
	);

	it("reports unexpected deletion errors and closes", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => {});
		const { modal, content, drop } = fixture();
		drop.mockRejectedValue(new Error("Unexpected"));
		modal.onOpen();
		await Promise.resolve();
		required(content, "cache-cleanup-confirm").click();
		await Promise.resolve();
		expect(content.children).toEqual([]);
		expect(notice).toHaveBeenCalledWith(
			"Cache cleanup failed. Some caches may not have been deleted.",
		);
	});

	it("opens from a synchronous declarative settings action, not a control", async () => {
		const { plugin, survey } = fixture();
		const group = performanceSettingDefinitions(plugin)[0];
		if (!group || !("items" in group))
			throw new Error("Missing performance group");
		const row = group.items.find(
			(item) =>
				"name" in item &&
				item.name === "Clean up caches from other vaults",
		);
		if (!row || !("action" in row) || !row.action)
			throw new Error("Missing cleanup action");
		expect(row).not.toHaveProperty("control");
		expect(row.action()).toBeUndefined();
		expect(opened).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		expect(survey).toHaveBeenCalledTimes(1);
	});
});
