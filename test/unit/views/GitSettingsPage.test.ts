import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { resetSearchComponents, searchComponents } from "../__mocks__/obsidian";
import { GitSettingsPage } from "src/views/settings/GitSettingsPage";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";

function makePage(vaultPath = "/") {
	const saveSettings = vi.fn().mockResolvedValue(undefined);

	const plugin = {
		settings: { ...DEFAULT_SETTINGS, vaultPath },
		saveSettings,
		secretStorageService: {
			hasToken: vi.fn().mockReturnValue(false),
			getToken: vi.fn().mockReturnValue(null),
		},
	} as unknown as QuartzSyncer;

	const page = new GitSettingsPage(new App(), plugin);

	const renderVaultPath = (
		page as unknown as { renderVaultPath: () => void }
	).renderVaultPath.bind(page);

	renderVaultPath();

	const control = searchComponents[searchComponents.length - 1];

	if (!control?.handler) {
		throw new Error("vault root folder control did not register onChange");
	}

	return { plugin, saveSettings, control, handler: control.handler };
}

describe("GitSettingsPage vault root folder", () => {
	beforeEach(() => {
		resetSearchComponents();
	});

	it("seeds the control from the persisted value", () => {
		const { control } = makePage("notes/");

		expect(control.value).toBe("notes/");
		expect(control.placeholder).toBe("/");
	});

	it("falls back to the whole vault when the value is empty", () => {
		const { control } = makePage("");

		expect(control.value).toBe("/");
	});

	// The control must normalize rather than assign raw input: an un-normalized
	// value reaches the publish path strip and yields `content//note.md`.
	it("normalizes typed input before persisting", async () => {
		const cases: Array<[string, string]> = [
			["notes", "notes/"],
			["/notes/", "notes/"],
			["./notes", "notes/"],
			["  notes  ", "notes/"],
			["notes//", "notes/"],
			["notes/nested", "notes/nested/"],
			["/", "/"],
			["", "/"],
			[".", "/"],
		];

		for (const [typed, expected] of cases) {
			const { plugin, handler } = makePage();

			await handler(typed);

			expect(plugin.settings.vaultPath).toBe(expected);
		}
	});

	it("persists through saveSettings so caches invalidate", async () => {
		const { saveSettings, handler } = makePage();

		await handler("notes");

		expect(saveSettings).toHaveBeenCalledTimes(1);
	});
});
