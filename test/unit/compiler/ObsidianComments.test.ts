import { describe, expect, it, vi } from "vitest";
import { protectObsidianComments } from "src/compiler/ObsidianComments";

describe("protected comment restoration", () => {
	it("fails closed when a transform removes or duplicates a protected span", () => {
		const protectedText = protectObsidianComments("%%private%%");
		expect(() => protectedText.restore("")).toThrow("lost or duplicated");
		expect(() =>
			protectedText.restore(protectedText.text + protectedText.text),
		).toThrow("lost or duplicated");
		expect(protectedText.restore(protectedText.text)).toBe("%%private%%");
	});
	it("avoids collisions with user-authored token-like content", () => {
		const first = "00000000-0000-4000-8000-000000000000";
		const second = "00000000-0000-4000-8000-000000000001";
		const randomUUID = vi
			.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(first)
			.mockReturnValueOnce(second);
		try {
			const source = `QSCOMMENT${first.replaceAll("-", "")}Z0Z Before %%private%% after`;
			const protectedText = protectObsidianComments(source);
			expect(protectedText.restore(protectedText.text)).toBe(source);
			expect(randomUUID).toHaveBeenCalledTimes(2);
		} finally {
			randomUUID.mockRestore();
		}
	});
	it("does not leak state after failed restoration", () => {
		const failed = protectObsidianComments("%%first%%");
		expect(() => failed.restore("")).toThrow();
		const retry = protectObsidianComments("%%second%%");
		expect(retry.restore(retry.text)).toBe("%%second%%");
	});
});
