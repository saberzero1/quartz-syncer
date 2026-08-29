import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

const DEFAULT_ACTION = "list";

export function createMediaHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const action = params.args.action?.toLowerCase() ?? DEFAULT_ACTION;
		const publisher = plugin.getPublisher();

		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		const status = await publisher.getPublishStatus();

		if (action === "list") {
			return {
				success: true,
				data: {
					count: status.media.length,
					files: status.media.map((m) => ({
						path: m.repoPath,
						linked: m.linked,
						size: m.size,
					})),
				},
			};
		}

		if (action === "orphaned") {
			const orphaned = status.media.filter((m) => !m.linked);

			return {
				success: true,
				data: {
					count: orphaned.length,
					files: orphaned.map((m) => ({
						path: m.repoPath,
						size: m.size,
					})),
				},
			};
		}

		if (action === "clean") {
			const orphaned = status.media.filter((m) => !m.linked);

			if (orphaned.length === 0) {
				return {
					success: true,
					data: { cleaned: 0, message: "No orphaned media found" },
				};
			}

			if (!params.flags.has("force")) {
				return {
					success: false,
					error: `${orphaned.length} orphaned media file(s) found. Use force flag to delete.`,
				};
			}

			if (params.flags.has("dry-run")) {
				return {
					success: true,
					data: {
						dryRun: true,
						wouldClean: orphaned.length,
						files: orphaned.map((m) => m.repoPath),
					},
				};
			}

			const result = await publisher.deleteByRepoPaths(
				orphaned.map((m) => m.repoPath),
				"Clean orphaned media via CLI",
			);

			return {
				success: result.success,
				data: {
					cleaned: result.filesDeleted,
				},
				error: result.error,
			};
		}

		return { success: false, error: `Unknown action: ${action}` };
	};
}
