import { describe, expect, it } from "vitest";
import type QuartzSyncerSettings from "src/models/settings";
import {
	excludedFolders,
	isExcludedVaultPath,
	validateExcludedFolders,
} from "src/publishFile/ExcludedFolders";
import { settingsFingerprint } from "src/cache/CompiledEntryValidity";

const settings = (excludedFolders = "") =>
	({ excludedFolders }) as QuartzSyncerSettings;

describe("excluded folders", () => {
	it.each([
		"Private/a.md",
		"Private/deep/a.png",
		"private/a.md",
		"/Private/a.md",
		"Private\\a.md",
		"Public/../Private/a.md",
	])("blocks a descendant: %s", (path) => {
		expect(isExcludedVaultPath(path, settings("./Private/"))).toBe(true);
	});
	it.each(["Private-ish/a.md", "Other/Private/a.md", "Public/a.md"])(
		"does not overmatch: %s",
		(path) => {
			expect(isExcludedVaultPath(path, settings("Private"))).toBe(false);
		},
	);
	it("normalizes Unicode, deduplicates and supports nested folders", () => {
		const config = settings("Private\nprivate/\nWork/Secrets\nCafe\u0301");
		expect(excludedFolders(config)).toEqual([
			"café",
			"private",
			"work/secrets",
		]);
		expect(isExcludedVaultPath("Café/a.md", config)).toBe(true);
	});
	it.each(["/", "../Private", "Private/../Other", "Private/**"])(
		"rejects ambiguous configuration: %s",
		(value) => {
			expect(validateExcludedFolders(value)).toBeTruthy();
			expect(() =>
				isExcludedVaultPath("Public/a.md", settings(value)),
			).toThrow();
		},
	);
	it("preserves behavior for existing settings without exclusions", () => {
		expect(
			isExcludedVaultPath("Private/a.md", {} as QuartzSyncerSettings),
		).toBe(false);
	});
	it("invalidates compiled data when exclusions change", () => {
		expect(settingsFingerprint(settings("Private"))).not.toBe(
			settingsFingerprint(settings("")),
		);
	});
});
