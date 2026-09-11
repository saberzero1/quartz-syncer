import { Platform } from "obsidian";
import type QuartzSyncerSettings from "src/models/settings";
import type { PublishTarget } from "src/models/settings";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
	joinPath,
} from "src/utils/external-fs";

export type PublishTargetBlocker =
	| "local-requires-desktop"
	| "local-not-configured"
	| "remote-not-configured"
	| "none-configured";

export type ResolvedPublishTarget = {
	requested: PublishTarget;
	effective: PublishTarget | null;
	/** True when the platform forced a destination other than the requested one. */
	overridden: boolean;
	blocker: PublishTargetBlocker | null;
};

/**
 * Resolves where publishing writes.
 *
 * A requested destination is never silently swapped for the other one: an
 * unconfigured choice resolves to null so the user is asked to fix it. The sole
 * exception is a local target on mobile, which cannot work at all, and that
 * override is reported through `overridden` so callers can surface it.
 */
export function resolvePublishTarget(
	settings: QuartzSyncerSettings,
): ResolvedPublishTarget {
	const requested = settings.publishTarget;
	const localConfigured = !!settings.quartzRepoPath;
	const remoteConfigured = !!settings.gitRemoteUrl;

	if (requested === "local") {
		if (localConfigured && Platform.isDesktopApp) {
			return {
				requested,
				effective: "local",
				overridden: false,
				blocker: null,
			};
		}

		if (localConfigured && !Platform.isDesktopApp) {
			return {
				requested,
				effective: remoteConfigured ? "remote" : null,
				overridden: remoteConfigured,
				blocker: "local-requires-desktop",
			};
		}

		return {
			requested,
			effective: null,
			overridden: false,
			blocker: remoteConfigured
				? "local-not-configured"
				: "none-configured",
		};
	}

	if (remoteConfigured) {
		return {
			requested,
			effective: "remote",
			overridden: false,
			blocker: null,
		};
	}

	return {
		requested,
		effective: null,
		overridden: false,
		blocker: localConfigured ? "remote-not-configured" : "none-configured",
	};
}

export function isPublishConfigured(settings: QuartzSyncerSettings): boolean {
	return resolvePublishTarget(settings).effective !== null;
}

export function describePublishTarget(target: PublishTarget): string {
	return target === "local" ? "local folder" : "remote";
}

export function describeBlocker(
	blocker: PublishTargetBlocker,
	settings: QuartzSyncerSettings,
): string {
	switch (blocker) {
		case "local-requires-desktop":
			return settings.gitRemoteUrl
				? "Local publishing is desktop only, so this device publishes to the remote."
				: "Local publishing is desktop only. Configure a git remote to publish from this device.";
		case "local-not-configured":
			return "Publish target is the local folder, but no local Quartz repo path is set.";
		case "remote-not-configured":
			return "Publish target is the remote, but no git remote URL is set.";
		case "none-configured":
			return "No repository configured.";
	}
}

export type BlockerResolution = {
	name: string;
	desc: string;
	opens: "hub" | "remote-setup";
};

/**
 * How the user fixes an unresolved destination. Only "none-configured" is a
 * genuine setup problem; the others mean a destination exists but was not the
 * one selected, so offering to create a repository would be wrong.
 */
export function describeBlockerResolution(
	blocker: PublishTargetBlocker,
	isDesktop: boolean,
): BlockerResolution {
	const setupName = isDesktop ? "Run setup wizard" : "Run manual setup";

	switch (blocker) {
		case "local-not-configured":
			return {
				name: "Link a local Quartz repo",
				desc: "Publishing to the local folder needs a local Quartz repo path. Link one, or switch the publish target back to the remote.",
				opens: "hub",
			};
		case "remote-not-configured":
			return {
				name: setupName,
				desc: "Publishing to the remote needs a git remote URL. Set one up, or switch the publish target back to the local folder.",
				opens: "remote-setup",
			};
		case "local-requires-desktop":
			return {
				name: setupName,
				desc: "Local publishing is desktop only. Configure a git remote to publish from this device. Your local repo path is kept for desktop.",
				opens: "remote-setup",
			};
		case "none-configured":
			return {
				name: setupName,
				desc: "No repository configured. Set up your Quartz site connection to get started.",
				opens: "remote-setup",
			};
	}
}

export type PublishReadinessIssue =
	| "missing-branch"
	| "missing-token"
	| "local-path-missing"
	| "local-path-not-a-directory"
	| "local-path-not-a-quartz-repo"
	| "system-commands-disabled";

const QUARTZ_CONFIG_FILES = [
	"quartz.config.ts",
	"quartz.config.js",
	"quartz.config.mjs",
	"quartz.config.json",
	"quartz.config.yaml",
	"quartz.config.yml",
];

/**
 * Problems that let publishing start but make it fail, or that disable Quartz
 * management. These are reported separately from `blocker`, which means no
 * destination could be resolved at all.
 */
export function checkPublishReadiness(
	settings: QuartzSyncerSettings,
	target: PublishTarget | null,
	deps: { hasToken: boolean },
): PublishReadinessIssue[] {
	const issues: PublishReadinessIssue[] = [];

	if (target && !settings.gitBranch) issues.push("missing-branch");

	if (
		target === "remote" &&
		settings.gitAuthType !== "none" &&
		!deps.hasToken
	) {
		issues.push("missing-token");
	}

	if (target === "local" && Platform.isDesktopApp) {
		const resolved = expandTilde(settings.quartzRepoPath);

		if (!externalFileExistsSync(resolved)) {
			issues.push("local-path-missing");
		} else if (!externalIsDirectorySync(resolved)) {
			issues.push("local-path-not-a-directory");
		} else if (
			!QUARTZ_CONFIG_FILES.some((candidate) =>
				externalFileExistsSync(joinPath(resolved, candidate)),
			)
		) {
			issues.push("local-path-not-a-quartz-repo");
		}
	}

	if (
		settings.quartzRepoPath &&
		Platform.isDesktopApp &&
		!settings.enableSystemCommands
	) {
		issues.push("system-commands-disabled");
	}

	return issues;
}

export function describeReadinessIssue(issue: PublishReadinessIssue): string {
	switch (issue) {
		case "missing-branch":
			return "No branch is set, so publishing cannot run.";
		case "missing-token":
			return "No token is stored, so publishing to the remote will fail authentication.";
		case "local-path-missing":
			return "The local Quartz repo path does not exist, so publishing will fail.";
		case "local-path-not-a-directory":
			return "The local Quartz repo path is not a directory, so publishing will fail.";
		case "local-path-not-a-quartz-repo":
			return "No Quartz config was found at the local repo path, so publishing may go to the wrong folder.";
		case "system-commands-disabled":
			return "Desktop commands are off, so Quartz builds, preview and plugin management are unavailable. Publishing is unaffected.";
	}
}

/**
 * Identifies the destination a cached publish status was computed against.
 * Status is tree-specific, so cached results must not be reused across targets.
 */
export function publishTargetIdentity(
	settings: QuartzSyncerSettings,
	target: PublishTarget | null,
): string {
	if (target === "local") return `local:${settings.quartzRepoPath}`;

	if (target === "remote") {
		return `remote:${settings.gitRemoteUrl}#${settings.gitBranch}`;
	}

	return "none";
}
