import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import type { QuartzVersion } from "./QuartzConfigTypes";

const QUARTZ_CONFIG_YAML = "quartz.config.yaml";
const QUARTZ_CONFIG_DEFAULT_YAML = "quartz.config.default.yaml";
const QUARTZ_PLUGINS_JSON = "quartz.plugins.json";
const QUARTZ_CONFIG_TS = "quartz.config.ts";
const PACKAGE_JSON = "package.json";

export class QuartzVersionDetector {
	/**
	 * Detect the Quartz configuration format by probing for known config files.
	 *
	 * Priority: quartz.config.yaml (v5) → quartz.plugins.json (legacy v5) → quartz.config.ts (v4).
	 */
	static async detectQuartzVersion(
		repo: QuartzFileSource,
	): Promise<QuartzVersion> {
		if (await QuartzVersionDetector.fileExists(repo, QUARTZ_CONFIG_YAML)) {
			console.debug("Detected Quartz v5 (YAML config)");

			return "v5-yaml";
		}

		if (
			await QuartzVersionDetector.fileExists(
				repo,
				QUARTZ_CONFIG_DEFAULT_YAML,
			)
		) {
			console.debug("Detected Quartz v5 (default YAML config)");

			return "v5-yaml";
		}

		if (await QuartzVersionDetector.fileExists(repo, QUARTZ_PLUGINS_JSON)) {
			console.debug("Detected Quartz v5 (legacy JSON config)");

			return "v5-json";
		}

		if (await QuartzVersionDetector.fileExists(repo, QUARTZ_CONFIG_TS)) {
			console.debug("Detected Quartz v4 (TypeScript config)");

			return "v4";
		}

		console.debug("No Quartz configuration detected");

		return "unknown";
	}

	/**
	 * Read the Quartz version string from the repository's `package.json`.
	 * Returns `null` if `package.json` is missing or has no `version` field.
	 */
	static async getQuartzPackageVersion(
		repo: QuartzFileSource,
	): Promise<string | null> {
		try {
			const content = await repo.readFile(PACKAGE_JSON);

			if (!content) return null;
			const pkg = JSON.parse(content) as { version?: string };

			return pkg.version ?? null;
		} catch (error) {
			console.debug("Could not read package.json version", error);

			return null;
		}
	}

	private static async fileExists(
		repo: QuartzFileSource,
		path: string,
	): Promise<boolean> {
		try {
			const content = await repo.readFile(path);

			return content !== null;
		} catch {
			return false;
		}
	}
}
