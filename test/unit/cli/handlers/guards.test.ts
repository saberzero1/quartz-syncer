import { describe, expect, it } from "vitest";
import { requireQuartzRunner } from "src/cli/handlers/guards";
import { buildPlugin } from "./helpers";

describe("requireQuartzRunner", () => {
	it("returns error when quartzRepoPath is empty", () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "",
			},
		});

		const result = requireQuartzRunner(plugin);

		expect(result).not.toBeNull();
		expect(result?.success).toBe(false);
		expect(result?.error).toBe(
			"No local Quartz repository path configured. Set it in Settings → Quartz Syncer → Quartz repo path.",
		);
	});

	it("returns error when quartzRunner is null but path exists", () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/home/user/quartz",
			},
			quartzRunner: null,
		});

		const result = requireQuartzRunner(plugin);

		expect(result).not.toBeNull();
		expect(result?.success).toBe(false);
		expect(result?.error).toBe(
			"System commands are not available. Enable them in settings and ensure Node.js is installed.",
		);
	});

	it("returns null when both quartzRepoPath and quartzRunner are present", () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				quartzRepoPath: "/home/user/quartz",
			},
			quartzRunner: {} as NonNullable<typeof plugin.quartzRunner>,
		});

		const result = requireQuartzRunner(plugin);

		expect(result).toBeNull();
	});
});
