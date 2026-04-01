import QuartzSyncer from "main";
import { validatePreFlight } from "src/cli/validators";

describe("validatePreFlight", () => {
	it("returns error when git.remoteUrl is empty", () => {
		const plugin = {
			settings: { git: { remoteUrl: "", branch: "main" } },
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBe(
			"Git remote URL is not configured. Set it in plugin settings or via 'quartz-syncer:config action=set key=git.remoteUrl value=<url>'.",
		);
	});

	it("returns error when git.branch is empty", () => {
		const plugin = {
			settings: { git: { remoteUrl: "https://example.com", branch: "" } },
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBe(
			"Git branch is not configured. Set it in plugin settings or via 'quartz-syncer:config action=set key=git.branch value=<branch>'.",
		);
	});

	it("returns null when git settings are present", () => {
		const plugin = {
			settings: {
				git: { remoteUrl: "https://example.com", branch: "main" },
			},
		} as unknown as QuartzSyncer;

		expect(validatePreFlight(plugin)).toBeNull();
	});
});
