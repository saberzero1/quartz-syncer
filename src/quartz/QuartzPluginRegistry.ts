import type { QuartzPluginSource } from "./QuartzConfigTypes";
import Logger from "js-logger";

const logger = Logger.get("quartz-plugin-registry");

const REGISTRY_URL =
	"https://raw.githubusercontent.com/quartz-community/registry/main/registry.json";

/** A single plugin entry from the community registry. */
export interface RegistryPluginEntry {
	/** Human-readable plugin name. */
	name: string;
	/** Short description of what the plugin does. */
	description: string;
	/** Plugin source — string shorthand or object for monorepo plugins. */
	source: QuartzPluginSource;
	/** Categorization tags (e.g. "component", "transformer", "navigation"). */
	tags: string[];
	/** Whether this is an official quartz-community plugin. */
	official: boolean;
}

/** Parsed registry response. */
interface RegistryData {
	version: string;
	plugins: RegistryPluginEntry[];
}

/**
 * Service for fetching and caching the community plugin registry.
 *
 * The registry is a single JSON file hosted in the
 * `quartz-community/registry` repository on GitHub.
 */
export class QuartzPluginRegistry {
	private cache: RegistryPluginEntry[] | null = null;
	private fetchPromise: Promise<RegistryPluginEntry[]> | null = null;

	/**
	 * Fetch the plugin registry, returning cached data if available.
	 * Concurrent calls share the same in-flight request.
	 */
	async getPlugins(): Promise<RegistryPluginEntry[]> {
		if (this.cache) return this.cache;

		if (this.fetchPromise) return this.fetchPromise;

		this.fetchPromise = this.fetchRegistry();

		try {
			const plugins = await this.fetchPromise;
			this.cache = plugins;

			return plugins;
		} finally {
			this.fetchPromise = null;
		}
	}

	/** Force a fresh fetch on next call. */
	clearCache(): void {
		this.cache = null;
	}

	private async fetchRegistry(): Promise<RegistryPluginEntry[]> {
		try {
			const response = await fetch(REGISTRY_URL);

			if (!response.ok) {
				logger.warn(
					`Failed to fetch plugin registry: ${response.status}`,
				);

				return [];
			}

			const data = (await response.json()) as RegistryData;

			return data.plugins ?? [];
		} catch (error) {
			logger.warn("Failed to fetch plugin registry:", error);

			return [];
		}
	}
}
