import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { resolvePublishTarget } from "src/publisher/PublishTargetResolver";
import {
	externalFileExists,
	externalIsDirectorySync,
	expandTilde,
	isAbsolutePath,
} from "src/utils/external-fs";

const DEFAULT_ACTION = "info";

export function createRepoHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;

		if (action === "info") {
			return handleInfo(plugin);
		}

		if (action === "set-local") {
			return handleSetLocal(plugin, params.args.path);
		}

		if (action === "set-remote") {
			return handleSetRemote(plugin);
		}

		if (action === "verify") {
			return handleVerify(plugin, params.args.path);
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}

function handleInfo(plugin: QuartzSyncer) {
	const { quartzRepoPath, gitRemoteUrl, gitBranch, contentFolder } =
		plugin.settings;

	const target = resolvePublishTarget(plugin.settings);

	return {
		success: true,
		data: {
			mode: target.effective ?? "none",
			requestedTarget: target.requested,
			targetOverridden: target.overridden,
			blocker: target.blocker,
			localPath: quartzRepoPath || null,
			remoteUrl: gitRemoteUrl || null,
			branch: gitBranch,
			contentFolder,
		},
	};
}

async function handleSetLocal(plugin: QuartzSyncer, path: string | undefined) {
	if (!path) {
		return { success: false, error: "Missing path parameter" };
	}

	const resolved = expandTilde(path);

	if (!isAbsolutePath(resolved)) {
		return { success: false, error: "Path must be absolute" };
	}

	if (!externalIsDirectorySync(resolved)) {
		return { success: false, error: `Directory not found: ${resolved}` };
	}

	const validation = await validateQuartzRepo(resolved);

	if (!validation.valid) {
		return {
			success: false,
			error: `Not a valid Quartz repository: ${validation.reason}`,
		};
	}

	plugin.settings.quartzRepoPath = resolved;
	plugin.settings.publishTarget = "local";
	await plugin.saveSettings();

	return {
		success: true,
		data: {
			mode: "local",
			localPath: resolved,
			quartzVersion: validation.version,
		},
	};
}

async function handleSetRemote(plugin: QuartzSyncer) {
	// Switches the destination only. The local path stays configured so the
	// Quartz Hub, builds and local preview keep working.
	plugin.settings.publishTarget = "remote";
	await plugin.saveSettings();

	const { gitRemoteUrl, gitBranch } = plugin.settings;

	return {
		success: true,
		data: {
			mode: gitRemoteUrl ? "remote" : "none",
			remoteUrl: gitRemoteUrl || null,
			branch: gitBranch,
		},
	};
}

async function handleVerify(plugin: QuartzSyncer, path: string | undefined) {
	const target = path ? expandTilde(path) : plugin.settings.quartzRepoPath;

	if (!target) {
		return {
			success: false,
			error: "No path provided and no local repo configured",
		};
	}

	if (!externalIsDirectorySync(target)) {
		return { success: false, error: `Directory not found: ${target}` };
	}

	const validation = await validateQuartzRepo(target);

	return {
		success: validation.valid,
		data: {
			path: target,
			valid: validation.valid,
			quartzVersion: validation.version,
			reason: validation.reason ?? undefined,
		},
		error: validation.valid ? undefined : validation.reason,
	};
}

async function validateQuartzRepo(
	dirPath: string,
): Promise<{ valid: boolean; version: string | null; reason?: string }> {
	const source = new LocalFileSource(dirPath);
	const version = await QuartzVersionDetector.detectQuartzVersion(source);

	if (version === "unknown") {
		return {
			valid: false,
			version: null,
			reason: "No Quartz configuration files found",
		};
	}

	const hasContent = await externalFileExists(`${dirPath}/content`);

	const hasDocs = await externalFileExists(`${dirPath}/docs`);

	if (!hasContent && !hasDocs) {
		return {
			valid: false,
			version: version,
			reason: "No content directory found",
		};
	}

	return { valid: true, version };
}
