import type QuartzSyncer from "src/main";
import type { CliHandler, CliParams, CliResult } from "src/cli/types";
import { createGitBackend } from "src/git/GitBackendFactory";
import {
	externalFileExists,
	externalIsDirectorySync,
} from "src/utils/external-fs";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

export function createTestHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		if (_plugin.settings.quartzRepoPath) {
			return handleLocalTest(_plugin, params);
		}

		if (!_plugin.settings.gitRemoteUrl) {
			return { success: false, error: "Repository not configured" };
		}

		const gitSettings = _plugin.getGitSettingsWithSecret();
		const backend = createGitBackend(
			{
				remoteUrl: gitSettings.remoteUrl,
				branch: gitSettings.branch,
				corsProxyUrl: gitSettings.corsProxyUrl,
				auth: gitSettings.auth,
			},
			_plugin.app,
		);

		const result = await backend.testConnection();
		if (!result.ok) {
			return {
				success: false,
				error: result.error ?? "Connection failed",
			};
		}

		return {
			success: true,
			data: {
				...result,
				...(params.verbose
					? {
							url: gitSettings.remoteUrl,
							branch: gitSettings.branch,
							authType: gitSettings.auth.type,
							provider: gitSettings.providerHint ?? "unknown",
						}
					: {}),
			},
		};
	};
}

async function handleLocalTest(
	plugin: QuartzSyncer,
	params: CliParams,
): Promise<CliResult> {
	const repoPath = plugin.settings.quartzRepoPath;
	const checks: Array<{ check: string; passed: boolean; detail?: string }> =
		[];

	const exists = await externalFileExists(repoPath);
	checks.push({
		check: "Path exists",
		passed: exists,
		detail: exists ? repoPath : `${repoPath} not found`,
	});

	if (!exists) {
		return {
			success: false,
			data: { mode: "local", checks },
			error: "Local repository path does not exist",
		};
	}

	const isDir = externalIsDirectorySync(repoPath);
	checks.push({
		check: "Is directory",
		passed: isDir,
		detail: isDir ? undefined : "Path is not a directory",
	});

	const source = new LocalFileSource(repoPath);
	const version = await QuartzVersionDetector.detectQuartzVersion(source);
	checks.push({
		check: "Quartz config detected",
		passed: version !== "unknown",
		detail: version === "unknown" ? "No config files found" : version,
	});

	const contentFolder = plugin.settings.contentFolder || "content";
	const contentExists = await externalFileExists(
		`${repoPath}/${contentFolder}`,
	);
	checks.push({
		check: "Content folder exists",
		passed: contentExists,
		detail: contentExists ? contentFolder : `${contentFolder} not found`,
	});

	const allPassed = checks.every((check) => check.passed);

	return {
		success: allPassed,
		data: {
			mode: "local",
			path: repoPath,
			quartzVersion: version !== "unknown" ? version : null,
			checks,
			...(params.verbose ? { contentFolder } : {}),
		},
		error: allPassed ? undefined : "Local repository validation failed",
	};
}
