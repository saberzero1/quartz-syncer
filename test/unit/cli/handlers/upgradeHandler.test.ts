import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUpgradeHandler } from "src/cli/handlers/upgradeHandler";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";
import { buildParams, buildPlugin } from "./helpers";

describe("upgradeHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs the local quartz update when system commands are enabled", async () => {
		const quartzRunner = {
			update: vi.fn(async () => ({ ok: true })),
		} as unknown as QuartzRunner;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				enableSystemCommands: true,
				quartzRepoPath: "/tmp/quartz",
			},
			quartzRunner,
		});
		const handler = createUpgradeHandler(plugin);

		const result = await handler(buildParams());
		expect(quartzRunner.update).toHaveBeenCalledWith({
			cwd: "/tmp/quartz",
		});
		expect(result).toEqual({
			success: true,
			data: { message: "Quartz updated via local CLI." },
		});
	});

	it("returns an error when the quartz update fails", async () => {
		const quartzRunner = {
			update: vi.fn(async () => ({ ok: false, error: "Update failed" })),
		} as unknown as QuartzRunner;
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				enableSystemCommands: true,
				quartzRepoPath: "/tmp/quartz",
			},
			quartzRunner,
		});
		const handler = createUpgradeHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Update failed",
		});
	});

	it("returns a placeholder message when local updates are unavailable", async () => {
		const plugin = buildPlugin();
		const handler = createUpgradeHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				message:
					"Quartz upgrade via CLI is coming soon. QuartzUpgradeService wiring is pending.",
			},
		});
	});
});
