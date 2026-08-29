import { describe, expect, it, vi } from "vitest";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "src/publishFile/Validator";
import { Notice } from "obsidian";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return {
		...actual,
		Notice: vi.fn(),
	};
});

describe("Validator", () => {
	it("detects publish flags and overrides", () => {
		expect(hasPublishFlag("publish", { publish: true })).toBe(true);
		expect(hasPublishFlag("publish", {})).toBe(false);
		expect(hasPublishFlag("publish", {}, true)).toBe(true);
	});

	it("notifies when publish frontmatter is missing", () => {
		const result = isPublishFrontmatterValid("publish", {}, false);
		const mockedNotice = vi.mocked(Notice);

		expect(result).toBe(false);
		expect(mockedNotice).toHaveBeenCalledWith(
			"Quartz Syncer: Note does not have the publish: true set. Please add this and try again.",
		);
	});

	it("returns true when publish frontmatter is present", () => {
		const result = isPublishFrontmatterValid(
			"publish",
			{ publish: true },
			false,
		);
		expect(result).toBe(true);
	});
});
