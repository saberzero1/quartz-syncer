import { requestUrl } from "obsidian";

const REGISTRY_URL =
	"https://quartz-community.github.io/marketplace/static/plugins.json";

/** A single plugin entry from the community registry. */
export interface RegistryPluginEntry {
	name: string;
	displayName: string;
	description: string;
	version: string;
	author: string;
	homepage: string | null;
	keywords: string[];
	category: string | string[];
	quartzVersion: string;
	dependencies: string[];
	defaultOrder: number | null;
	defaultEnabled: boolean | null;
	defaultOptions: Record<string, unknown> | null;
	configSchema: Record<string, unknown> | null;
	components: Record<
		string,
		{
			displayName: string;
			defaultPosition?: string;
			defaultPriority?: number;
		}
	> | null;
	frames: Record<string, { exportName: string }> | null;
	requiresInstall: boolean;
	source: string;
	repo: string;
	stars: number;
	license: string;
	official: boolean;
	lastUpdated: string;
	installCommand: string;
	configureCommand: string;
}

/** Parsed registry response. */
interface RegistryData {
	$schema?: string;
	schemaVersion: number;
	generatedAt: string;
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
			const response = await requestUrl({ url: REGISTRY_URL });

			if (response.status < 200 || response.status >= 300) {
				console.debug(
					`Failed to fetch plugin registry: ${response.status}`,
				);

				return [];
			}

			const data = response.json as RegistryData;

			return data.plugins ?? [];
		} catch (error) {
			console.debug("Failed to fetch plugin registry:", error);

			return [];
		}
	}
}
