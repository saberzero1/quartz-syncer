import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

export function createValidateHandler(plugin: QuartzSyncer): CliHandler {
	return async () => {
		const repo = createRepositoryAdapter(plugin);

		if (!repo) {
			return { success: false, error: "Repository not configured" };
		}

		const checks: Array<{
			check: string;
			passed: boolean;
			detail?: string;
		}> = [];

		const version = await QuartzVersionDetector.detectQuartzVersion(repo);
		checks.push({
			check: "Quartz version detected",
			passed: version !== "unknown",
			detail: version === "unknown" ? "No config files found" : version,
		});

		if (version === "v5-yaml") {
			const userConfig = await repo.readFile("quartz.config.yaml");
			const defaultConfig = await repo.readFile(
				"quartz.config.default.yaml",
			);

			checks.push({
				check: "Configuration readable",
				passed: userConfig !== null || defaultConfig !== null,
				detail:
					userConfig !== null
						? "User config present"
						: defaultConfig !== null
							? "Default config only"
							: "No config files readable",
			});

			if (userConfig !== null || defaultConfig !== null) {
				const configContent = userConfig ?? defaultConfig;

				try {
					const { parse } = await import("yaml");
					const parsed = parse(configContent!) as Record<
						string,
						unknown
					>;

					checks.push({
						check: "Configuration valid YAML",
						passed: true,
					});

					const hasConfiguration =
						parsed && typeof parsed.configuration === "object";
					checks.push({
						check: "Configuration has required fields",
						passed: hasConfiguration,
						detail: hasConfiguration
							? undefined
							: "Missing configuration key",
					});
				} catch (error) {
					checks.push({
						check: "Configuration valid YAML",
						passed: false,
						detail:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
			}
		}

		if (version === "v5-json") {
			const pluginsJson = await repo.readFile("quartz.plugins.json");

			checks.push({
				check: "Plugins config readable",
				passed: pluginsJson !== null,
			});

			if (pluginsJson !== null) {
				try {
					JSON.parse(pluginsJson);
					checks.push({
						check: "Plugins config valid JSON",
						passed: true,
					});
				} catch (error) {
					checks.push({
						check: "Plugins config valid JSON",
						passed: false,
						detail:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
			}
		}

		const contentFolder = plugin.settings.contentFolder || "content";
		const contentExists = await repo.exists(contentFolder);
		checks.push({
			check: "Content folder exists",
			passed: contentExists,
			detail: contentExists
				? contentFolder
				: `${contentFolder} not found`,
		});

		const configService = new QuartzConfigService(repo);
		const lockFile = await configService.readLockFile();

		checks.push({
			check: "Plugin lockfile present",
			passed: lockFile !== null,
			detail: lockFile
				? `${Object.keys(lockFile.plugins).length} plugin(s) locked`
				: "quartz.lock.json not found (optional)",
		});

		if (lockFile) {
			const hasPluginsKey =
				lockFile.plugins !== undefined &&
				typeof lockFile.plugins === "object";

			checks.push({
				check: "Plugin lockfile valid",
				passed: hasPluginsKey,
				detail: hasPluginsKey
					? undefined
					: "Missing plugins key in lockfile",
			});
		}

		const lockfileChecks = ["Plugin lockfile present"];
		const allPassed = checks.every(
			(check) => check.passed || lockfileChecks.includes(check.check),
		);

		return {
			success: allPassed,
			data: {
				valid: allPassed,
				quartzVersion: version,
				checks,
			},
			error: allPassed ? undefined : "Validation failed",
		};
	};
}
