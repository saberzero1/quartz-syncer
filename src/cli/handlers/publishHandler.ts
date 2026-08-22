import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { isMediaFile } from "src/utils/mediaTypes";

export function createPublishHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const action = params.args.action?.toLowerCase();

		if (action === "arbitrary") {
			if (!_plugin.settings.allowArbitraryFilePublishing) {
				return {
					success: false,
					error: "Arbitrary file publishing is disabled. Enable it in settings.",
				};
			}

			if (!params.flags.has("force")) {
				return {
					success: false,
					error: "Arbitrary file publishing requires the 'force' flag.",
				};
			}

			const paths = _plugin.settings.arbitraryPublishPaths;

			if (!paths || paths.length === 0) {
				return {
					success: false,
					error: "No arbitrary publish paths configured in settings.",
				};
			}

			if (params.flags.has("dry-run")) {
				return {
					success: true,
					data: { dryRun: true, paths },
				};
			}

			const files: Array<{
				repoPath: string;
				content: string | Uint8Array;
				encoding: "utf-8" | "base64";
			}> = [];

			for (const filePath of paths) {
				const vaultFile = _plugin.app.vault.getFileByPath(filePath);
				if (!vaultFile) continue;

				const isBinary = isMediaFile(filePath);

				if (isBinary) {
					const buffer =
						await _plugin.app.vault.readBinary(vaultFile);
					const bytes = new Uint8Array(buffer);
					files.push({
						repoPath: filePath,
						content: bytes,
						encoding: "base64",
					});
				} else {
					const content = await _plugin.app.vault.read(vaultFile);
					files.push({
						repoPath: filePath,
						content,
						encoding: "utf-8",
					});
				}
			}

			if (files.length === 0) {
				return {
					success: false,
					error: "No matching files found in vault for configured paths.",
				};
			}

			const commitMessage =
				params.args.message ??
				"Published arbitrary files via Quartz Syncer CLI";
			const result = await publisher.publishArbitraryFiles(
				files,
				commitMessage,
			);

			return {
				success: result.success,
				data: {
					filesPublished: result.filesPublished,
					commitSha: result.commitSha,
					...(params.verbose
						? { files: files.map((file) => file.repoPath) }
						: {}),
				},
				error: result.error,
			};
		}

		const status = await publisher.getPublishStatus();
		const files = [...status.unpublished, ...status.changed];
		const publishPaths = files.map((file) => file.getVaultPath());

		if (params.flags.has("dry-run")) {
			return {
				success: true,
				data: {
					files: publishPaths,
				},
			};
		}
		const commitMessage =
			params.args.message ?? "Published via Quartz Syncer CLI";
		const result = await publisher.publishBatch(files, commitMessage);

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Publish failed",
			};
		}

		return {
			success: true,
			data: {
				...result,
				...(params.verbose ? { files: publishPaths } : {}),
			},
		};
	};
}
