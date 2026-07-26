import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type { QuartzVersion } from "./QuartzConfigTypes";

const QUARTZ_CONFIG_YAML = "quartz.config.yaml";
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
		repo: RepositoryConnection,
	): Promise<QuartzVersion> {
		if (await QuartzVersionDetector.fileExists(repo, QUARTZ_CONFIG_YAML)) {
			console.debug("Detected Quartz v5 (YAML config)");

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
		repo: RepositoryConnection,
	): Promise<string | null> {
		try {
			const file = await repo.getRawFile(PACKAGE_JSON);

			if (!file) return null;

			/* eslint-disable-next-line no-undef -- Buffer polyfill available at runtime */
			const content = Buffer.from(file.content, "base64").toString(
				"utf-8",
			);
			const pkg = JSON.parse(content) as { version?: string };

			return pkg.version ?? null;
		} catch (error) {
			console.debug("Could not read package.json version", error);

			return null;
		}
	}

	private static async fileExists(
		repo: RepositoryConnection,
		path: string,
	): Promise<boolean> {
		try {
			const file = await repo.getRawFile(path);

			return file !== undefined;
		} catch {
			return false;
		}
	}
}
