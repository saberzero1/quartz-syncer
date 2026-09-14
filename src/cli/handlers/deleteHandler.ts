import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { matchGlob, normalizeFuzzy } from "src/cli/pathMatching";

export function createDeleteHandler(_plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const publisher = _plugin.getPublisher();
		if (!publisher) {
			return { success: false, error: "Repository not configured" };
		}

		if (!params.flags.has("force")) {
			return {
				success: false,
				error: "Destructive operation requires the 'force' flag.",
			};
		}

		const action = params.args.action?.toLowerCase();
		if (params.flags.has("action")) {
			return { success: false, error: "Missing action value" };
		}
		if (action !== undefined && action !== "unpublish") {
			return { success: false, error: `Unknown action: ${action}` };
		}
		const unpublish = action === "unpublish";
		const pathArg = params.args.path;
		if (unpublish && !pathArg?.trim()) {
			return { success: false, error: "Missing path parameter" };
		}
		if (!unpublish && (pathArg !== undefined || params.flags.has("path"))) {
			return {
				success: false,
				error: "A path requires action=unpublish. Omit path to delete removed notes.",
			};
		}

		const status = await publisher.getPublishStatus();
		let deletePaths = status.deleted;
		let bulkPattern = false;
		if (unpublish && pathArg) {
			const publishedPaths = status.published.map((file) =>
				file.getVaultPath(),
			);
			const isFuzzy = pathArg.startsWith("~");
			const isGlob = pathArg.includes("*");
			if (isFuzzy) {
				const query = normalizeFuzzy(pathArg.slice(1).trim());
				if (!query) {
					return {
						success: false,
						error: "Missing fuzzy search query",
					};
				}
				deletePaths = publishedPaths.filter((path) =>
					normalizeFuzzy(path.split("/").pop() ?? "").includes(query),
				);
			} else if (isGlob) {
				if (/[?{}[\]!]/.test(pathArg)) {
					return {
						success: false,
						error: `Unsupported glob pattern: ${pathArg}`,
					};
				}
				deletePaths = publishedPaths.filter((path) =>
					matchGlob(pathArg, path),
				);
			} else {
				deletePaths = publishedPaths.filter((path) => path === pathArg);
			}
			deletePaths = [...new Set(deletePaths)];
			if (deletePaths.length === 0) {
				return {
					success: false,
					error: `No published notes matched: ${pathArg}`,
				};
			}
			bulkPattern =
				(isFuzzy || isGlob) &&
				publishedPaths.length > 5 &&
				deletePaths.length > publishedPaths.length * 0.8;
		}

		if (params.flags.has("dry-run")) {
			return {
				success: true,
				data: {
					files: deletePaths,
					...(bulkPattern
						? {
								warning:
									"Pattern matches more than 80% of published notes; execution is blocked. Use narrower patterns or exact paths.",
							}
						: {}),
				},
			};
		}
		if (bulkPattern) {
			return {
				success: false,
				error: "Refusing to unpublish more than 80% of published notes with a pattern. Use dry-run to inspect matches, then narrower patterns or exact paths.",
				data: { files: deletePaths },
			};
		}
		const commitMessage =
			params.args.message ??
			(unpublish
				? "Unpublished via Quartz Syncer CLI"
				: "Deleted via Quartz Syncer CLI");
		const result = await publisher.deleteBatch(deletePaths, commitMessage);

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Delete failed",
			};
		}

		return {
			success: true,
			data: {
				...result,
				...(params.verbose ? { files: deletePaths } : {}),
			},
		};
	};
}
