import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, notices, resetNotices } from "obsidian";
import {
	applyPublishFlag,
	applyPublishFlagToActiveFile,
	type PublishFlagAction,
} from "src/publishFile/publishFlag";

const { apply, get, remove, set } = vi.hoisted(() => ({
	apply: vi.fn().mockResolvedValue(undefined),
	get: vi.fn(),
	remove: vi.fn(),
	set: vi.fn(),
}));

vi.mock("src/publishFile/ObsidianFrontMatterEngine", () => ({
	default: class {
		apply = apply;
		get = get;
		remove = remove;
		set = set;
	},
}));

const makeFile = (path = "notes/post.md", extension = "md"): TFile => {
	const file = new TFile();
	file.path = path;
	file.basename = "post";
	file.extension = extension;

	return file;
};

describe("applyPublishFlag", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetNotices();
	});

	it.each<[PublishFlagAction, boolean]>([
		["publish", true],
		["unpublish", false],
	])("writes %s as %s", async (action, expected) => {
		await applyPublishFlag(new App(), makeFile(), "publish", action);

		expect(set).toHaveBeenCalledWith("publish", expected);
		expect(apply).toHaveBeenCalledTimes(1);
	});

	it.each([
		[true, false],
		[false, true],
		[undefined, true],
	])("toggles a current value of %s to %s", async (current, expected) => {
		get.mockReturnValue(current);

		await applyPublishFlag(new App(), makeFile(), "publish", "toggle");

		expect(set).toHaveBeenCalledWith("publish", expected);
	});

	it("removes the key", async () => {
		await applyPublishFlag(new App(), makeFile(), "publish", "remove");

		expect(remove).toHaveBeenCalledWith("publish");
		expect(set).not.toHaveBeenCalled();
	});

	it("honours a renamed publish key", async () => {
		await applyPublishFlag(new App(), makeFile(), "dg-publish", "publish");

		expect(set).toHaveBeenCalledWith("dg-publish", true);
	});
});

describe("applyPublishFlagToActiveFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetNotices();
	});

	it("writes the flag on the active note and reports it", async () => {
		const app = new App();
		app.workspace.getActiveFile.mockReturnValue(makeFile());

		await applyPublishFlagToActiveFile(app, "publish", "publish");

		expect(set).toHaveBeenCalledWith("publish", true);
		expect(notices).toEqual(["Quartz Syncer: post marked as publishable."]);
	});

	it.each([null, makeFile("assets/image.png", "png")])(
		"refuses to write when the active file is %s",
		async (active) => {
			const app = new App();
			app.workspace.getActiveFile.mockReturnValue(active);

			await applyPublishFlagToActiveFile(app, "publish", "publish");

			expect(apply).not.toHaveBeenCalled();
			expect(notices).toEqual([
				"Quartz Syncer: open a markdown note first.",
			]);
		},
	);

	it("reports a write failure rather than throwing", async () => {
		const app = new App();
		app.workspace.getActiveFile.mockReturnValue(makeFile());
		apply.mockRejectedValueOnce(new Error("file is read-only"));

		await applyPublishFlagToActiveFile(app, "publish", "toggle");

		expect(notices).toEqual([
			"Quartz Syncer: could not update post. file is read-only",
		]);
	});
});
