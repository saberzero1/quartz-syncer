import { describe, expect, it, beforeEach } from "vitest";
import * as nodePath from "node:path";
import { Platform } from "obsidian";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncerSettings from "src/models/settings";
import {
	checkPublishReadiness,
	describeBlockerResolution,
	describeReadinessIssue,
	isPublishConfigured,
	publishTargetIdentity,
	resolvePublishTarget,
} from "src/publisher/PublishTargetResolver";

function settings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

const LOCAL = "/home/user/quartz";
const REMOTE = "https://github.com/user/repo.git";

beforeEach(() => {
	Platform.isDesktopApp = true;
	Platform.isMobileApp = false;
});

describe("resolvePublishTarget on desktop", () => {
	it("uses the local folder when local is selected and configured", () => {
		const result = resolvePublishTarget(
			settings({ publishTarget: "local", quartzRepoPath: LOCAL }),
		);

		expect(result.effective).toBe("local");
		expect(result.overridden).toBe(false);
		expect(result.blocker).toBeNull();
	});

	it("uses the remote when remote is selected and configured", () => {
		const result = resolvePublishTarget(
			settings({ publishTarget: "remote", gitRemoteUrl: REMOTE }),
		);

		expect(result.effective).toBe("remote");
		expect(result.blocker).toBeNull();
	});

	it("keeps the local selection when a remote is also configured", () => {
		const result = resolvePublishTarget(
			settings({
				publishTarget: "local",
				quartzRepoPath: LOCAL,
				gitRemoteUrl: REMOTE,
			}),
		);

		expect(result.effective).toBe("local");
		expect(result.overridden).toBe(false);
	});

	it("keeps the remote selection when a local path is also configured", () => {
		const result = resolvePublishTarget(
			settings({
				publishTarget: "remote",
				quartzRepoPath: LOCAL,
				gitRemoteUrl: REMOTE,
			}),
		);

		expect(result.effective).toBe("remote");
		expect(result.overridden).toBe(false);
	});

	it("does not fall back to the remote when local is selected but unset", () => {
		const result = resolvePublishTarget(
			settings({ publishTarget: "local", gitRemoteUrl: REMOTE }),
		);

		expect(result.effective).toBeNull();
		expect(result.blocker).toBe("local-not-configured");
	});

	it("does not fall back to local when the remote is selected but unset", () => {
		const result = resolvePublishTarget(
			settings({ publishTarget: "remote", quartzRepoPath: LOCAL }),
		);

		expect(result.effective).toBeNull();
		expect(result.blocker).toBe("remote-not-configured");
	});

	it("reports nothing configured when neither is set", () => {
		expect(resolvePublishTarget(settings()).blocker).toBe(
			"none-configured",
		);
	});
});

describe("resolvePublishTarget on mobile", () => {
	beforeEach(() => {
		Platform.isDesktopApp = false;
		Platform.isMobileApp = true;
	});

	it("redirects a local selection to a configured remote", () => {
		const result = resolvePublishTarget(
			settings({
				publishTarget: "local",
				quartzRepoPath: LOCAL,
				gitRemoteUrl: REMOTE,
			}),
		);

		expect(result.effective).toBe("remote");
		expect(result.overridden).toBe(true);
		expect(result.blocker).toBe("local-requires-desktop");
	});

	it("is unconfigured when local is selected and no remote exists", () => {
		const result = resolvePublishTarget(
			settings({ publishTarget: "local", quartzRepoPath: LOCAL }),
		);

		expect(result.effective).toBeNull();
		expect(result.overridden).toBe(false);
		expect(result.blocker).toBe("local-requires-desktop");
	});

	it("leaves the synced local path in settings untouched", () => {
		const input = settings({
			publishTarget: "local",
			quartzRepoPath: LOCAL,
			gitRemoteUrl: REMOTE,
		});
		resolvePublishTarget(input);

		expect(input.quartzRepoPath).toBe(LOCAL);
		expect(input.publishTarget).toBe("local");
	});

	it("still uses a remote selection normally", () => {
		expect(
			resolvePublishTarget(
				settings({ publishTarget: "remote", gitRemoteUrl: REMOTE }),
			).effective,
		).toBe("remote");
	});
});

describe("isPublishConfigured", () => {
	it("tracks the resolved target rather than the raw settings", () => {
		expect(
			isPublishConfigured(
				settings({ publishTarget: "remote", quartzRepoPath: LOCAL }),
			),
		).toBe(false);

		expect(
			isPublishConfigured(
				settings({ publishTarget: "local", quartzRepoPath: LOCAL }),
			),
		).toBe(true);
	});
});

describe("describeBlockerResolution", () => {
	it("sends a local-only gap to the hub, not the repo-creation wizard", () => {
		const resolution = describeBlockerResolution(
			"local-not-configured",
			true,
		);

		expect(resolution.opens).toBe("hub");
		expect(resolution.desc).not.toContain("No repository configured");
	});

	it("sends a genuine first-time setup to the wizard", () => {
		expect(describeBlockerResolution("none-configured", true)).toEqual({
			name: "Run setup wizard",
			desc: "No repository configured. Set up your Quartz site connection to get started.",
			opens: "remote-setup",
		});
	});

	it("offers remote setup when the remote is the missing piece", () => {
		expect(
			describeBlockerResolution("remote-not-configured", true).opens,
		).toBe("remote-setup");
		expect(
			describeBlockerResolution("local-requires-desktop", false).opens,
		).toBe("remote-setup");
	});

	it("says the local path is kept when redirecting a mobile user", () => {
		expect(
			describeBlockerResolution("local-requires-desktop", false).desc,
		).toContain("kept for desktop");
	});

	it("uses manual setup wording off desktop", () => {
		expect(describeBlockerResolution("none-configured", false).name).toBe(
			"Run manual setup",
		);
	});
});

describe("checkPublishReadiness", () => {
	beforeEach(() => {
		(window as Window & { require?: (module: string) => unknown }).require =
			(module: string) => {
				if (module === "path") return nodePath;
				if (module === "os") return { homedir: () => "/home/user" };

				if (module === "fs") {
					return {
						existsSync: () => false,
						statSync: () => ({
							isDirectory: () => false,
							isFile: () => false,
						}),
					};
				}
				throw new Error(`Unknown module: ${module}`);
			};
	});

	it("reports a missing token only when the remote needs one", () => {
		const remote = settings({
			publishTarget: "remote",
			gitRemoteUrl: REMOTE,
			gitAuthType: "bearer",
		});

		expect(
			checkPublishReadiness(remote, "remote", { hasToken: false }),
		).toContain("missing-token");

		expect(
			checkPublishReadiness(remote, "remote", { hasToken: true }),
		).not.toContain("missing-token");
	});

	it("does not demand a token for the local target", () => {
		const local = settings({
			publishTarget: "local",
			quartzRepoPath: LOCAL,
			gitAuthType: "bearer",
		});

		expect(
			checkPublishReadiness(local, "local", { hasToken: false }),
		).not.toContain("missing-token");
	});

	it("reports an empty branch", () => {
		expect(
			checkPublishReadiness(
				settings({ gitRemoteUrl: REMOTE, gitBranch: "" }),
				"remote",
				{ hasToken: true },
			),
		).toContain("missing-branch");
	});

	it("reports a local path that does not exist", () => {
		expect(
			checkPublishReadiness(
				settings({ publishTarget: "local", quartzRepoPath: LOCAL }),
				"local",
				{ hasToken: true },
			),
		).toContain("local-path-missing");
	});

	it("reports disabled desktop commands without blocking publishing", () => {
		const issues = checkPublishReadiness(
			settings({
				publishTarget: "remote",
				gitRemoteUrl: REMOTE,
				quartzRepoPath: LOCAL,
				enableSystemCommands: false,
			}),
			"remote",
			{ hasToken: true },
		);

		expect(issues).toContain("system-commands-disabled");
		expect(issues).not.toContain("missing-branch");
	});

	it("checks nothing platform-specific on mobile", () => {
		Platform.isDesktopApp = false;
		Platform.isMobileApp = true;

		const issues = checkPublishReadiness(
			settings({
				publishTarget: "local",
				quartzRepoPath: LOCAL,
				gitRemoteUrl: REMOTE,
			}),
			"remote",
			{ hasToken: true },
		);

		expect(issues).not.toContain("local-path-missing");
		expect(issues).not.toContain("system-commands-disabled");
	});

	it("has a message for every issue", () => {
		const all = [
			"missing-branch",
			"missing-token",
			"local-path-missing",
			"local-path-not-a-directory",
			"local-path-not-a-quartz-repo",
			"system-commands-disabled",
		] as const;

		for (const issue of all) {
			expect(describeReadinessIssue(issue).length).toBeGreaterThan(0);
		}
	});
});

describe("publishTargetIdentity", () => {
	it("distinguishes destinations so cached status is not reused", () => {
		const both = settings({
			quartzRepoPath: LOCAL,
			gitRemoteUrl: REMOTE,
			gitBranch: "v5",
		});

		expect(publishTargetIdentity(both, "local")).toBe(`local:${LOCAL}`);
		expect(publishTargetIdentity(both, "remote")).toBe(
			`remote:${REMOTE}#v5`,
		);
		expect(publishTargetIdentity(both, null)).toBe("none");
	});

	it("changes when the remote branch changes", () => {
		const a = settings({ gitRemoteUrl: REMOTE, gitBranch: "v5" });
		const b = settings({ gitRemoteUrl: REMOTE, gitBranch: "v4" });

		expect(publishTargetIdentity(a, "remote")).not.toBe(
			publishTargetIdentity(b, "remote"),
		);
	});
});
