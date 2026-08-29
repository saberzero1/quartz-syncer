import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

export function createDiffHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = plugin.getPublisher();

		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();
		const targetPath = params.args.path;
		const filesToDiff = targetPath
			? [...status.unpublished, ...status.changed].filter(
					(f) => f.getVaultPath() === targetPath,
				)
			: [...status.unpublished, ...status.changed];

		if (targetPath && filesToDiff.length === 0) {
			return {
				success: false,
				error: `File not found or not pending: ${targetPath}`,
			};
		}

		const diffs: Array<{
			path: string;
			status: "new" | "changed";
			local: string | null;
			remote: string | null;
		}> = [];

		for (const file of filesToDiff) {
			const vaultPath = file.getVaultPath();
			const local = await publisher.getLocalCompiledContent(file);
			const remote = await publisher.getRemoteFileContent(vaultPath);
			const isNew = status.unpublished.includes(file);

			diffs.push({
				path: vaultPath,
				status: isNew ? "new" : "changed",
				local,
				remote,
			});
		}

		return {
			success: true,
			data: {
				count: diffs.length,
				diffs,
			},
		};
	};
}
