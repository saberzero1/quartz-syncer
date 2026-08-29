import { Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import { QuartzHubService } from "src/services/QuartzHubService";

const buildPlugin = (overrides?: Partial<QuartzSyncer>): QuartzSyncer => {
	return {
		settings: {
			quartzRepoPath: "",
			enableSystemCommands: true,
		},
		processRunner: null,
		quartzRunner: null,
		binaryDetector: null,
		...overrides,
	} as QuartzSyncer;
};

describe("QuartzHubService", () => {
	beforeEach(() => {
		Platform.isDesktopApp = true;
	});

	afterEach(() => {
		Platform.isDesktopApp = true;
		vi.restoreAllMocks();
	});

	it("validateRepoPath returns false for empty path", () => {
		const plugin = buildPlugin();
		const service = new QuartzHubService(plugin);

		const result = service.validateRepoPath("   ");

		expect(result.ok).toBe(false);
	});

	it("validateRepoPath returns false on non-desktop", () => {
		Platform.isDesktopApp = false;
		const plugin = buildPlugin({
			settings: {
				quartzRepoPath: "/tmp/quartz",
				enableSystemCommands: true,
			},
		});
		const service = new QuartzHubService(plugin);

		const result = service.validateRepoPath("/tmp/quartz");

		expect(result.ok).toBe(false);
	});

	it("canRunActions returns false when system commands disabled", () => {
		const plugin = buildPlugin({
			settings: {
				quartzRepoPath: "/tmp/quartz",
				enableSystemCommands: false,
			},
		});
		const service = new QuartzHubService(plugin);
		vi.spyOn(service, "validateRepoPath").mockReturnValue({
			ok: true,
			message: "Quartz repo detected.",
		});

		const result = service.canRunActions();

		expect(result.ok).toBe(false);
	});
});
