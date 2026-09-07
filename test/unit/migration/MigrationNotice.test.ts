import { App } from "obsidian";
import {
	MigrationNotice,
	shouldShowMigrationNotice,
} from "src/views/MigrationNotice";

describe("MigrationNotice", () => {
	it("explains v4 publishing support without offering database cleanup", () => {
		const modal = new MigrationNotice(new App());
		modal.onOpen();

		expect(modal.titleEl.setText).toHaveBeenCalledWith(
			"Welcome to Quartz Syncer v2",
		);
		expect(modal.contentEl.createEl).toHaveBeenCalledWith("p", {
			text: "Publishing notes and media to Quartz v4 is supported and continues to work.",
		});
		expect(modal.contentEl.createEl).toHaveBeenCalledWith("p", {
			text: "Quartz site management (config editing, plugin management, upgrades) requires Quartz v5.",
		});
		const calls = vi.mocked(modal.contentEl.createEl).mock.calls;
		expect(calls.filter(([tag]) => tag === "button")).toEqual([
			["button", { text: "Close", cls: "qs-migration-close-btn" }],
		]);
		expect(JSON.stringify(calls)).not.toContain("Clean up");
	});
});

describe("shouldShowMigrationNotice", () => {
	it("returns true when upgrading from v1.x to v2.x", () => {
		expect(shouldShowMigrationNotice("1.18.0", "2.0.0")).toBe(true);
		expect(shouldShowMigrationNotice("1.0.0", "2.0.0")).toBe(true);
		expect(shouldShowMigrationNotice("1.18.0", "2.0.1")).toBe(true);
	});

	it("returns false when both are v2.x", () => {
		expect(shouldShowMigrationNotice("2.0.0", "2.0.1")).toBe(false);
	});

	it("returns false when both are v1.x", () => {
		expect(shouldShowMigrationNotice("1.17.0", "1.18.0")).toBe(false);
	});

	it("returns false when previous version is empty", () => {
		expect(shouldShowMigrationNotice("", "2.0.0")).toBe(false);
	});

	it("returns false for fresh install (no previous version)", () => {
		expect(shouldShowMigrationNotice("", "2.0.0")).toBe(false);
	});
});
