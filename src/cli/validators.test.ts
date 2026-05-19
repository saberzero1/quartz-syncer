import type QuartzSyncer from "main";
import { validatePreFlight } from "src/cli/validators";

describe("validatePreFlight", () => {
	it("returns error when gitRemoteUrl is empty", () => {
		const plugin = {
			settings: { gitRemoteUrl: "", gitBranch: "main" },
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBe(
			"Git remote URL is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=gitRemoteUrl value=<url>'.",
		);
	});

	it("returns error when gitBranch is empty", () => {
		const plugin = {
			settings: { gitRemoteUrl: "https://example.com", gitBranch: "" },
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBe(
			"Git branch is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=gitBranch value=<branch>'.",
		);
	});

	it("returns null when git settings are present", () => {
		const plugin = {
			settings: {
				gitRemoteUrl: "https://example.com",
				gitBranch: "main",
			},
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBeNull();
	});
});
