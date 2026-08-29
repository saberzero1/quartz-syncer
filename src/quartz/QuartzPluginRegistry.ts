import { requestUrl } from "obsidian";
import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";

const REGISTRY_URL =
	"https://quartz-community.github.io/marketplace/static/plugins.json";

const REGISTRY_TTL_MS = 3_600_000;

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

interface PersistedRegistry {
	plugins: RegistryPluginEntry[];
	fetchedAt: number;
}

export class QuartzPluginRegistry {
	private cache: RegistryPluginEntry[] | null = null;
	private fetchPromise: Promise<RegistryPluginEntry[]> | null = null;
	private store: IndexedDBStore | null = null;

	enablePersistence(vaultName: string, pluginId: string): void {
		this.store = createStore(`${vaultName}-${pluginId}-registry`);
	}

	async getPlugins(): Promise<RegistryPluginEntry[]> {
		if (this.cache) return this.cache;

		if (this.fetchPromise) return this.fetchPromise;

		this.fetchPromise = this.loadAndFetch();

		try {
			return await this.fetchPromise;
		} finally {
			this.fetchPromise = null;
		}
	}

	private async loadAndFetch(): Promise<RegistryPluginEntry[]> {
		if (this.store) {
			const persisted = await this.loadPersisted();

			if (persisted) {
				this.cache = persisted;
				void this.fetchAndPersist();
				return persisted;
			}
		}

		return this.fetchAndPersist();
	}

	clearCache(): void {
		this.cache = null;
		this.store?.removeItem("registry").catch(() => {});
	}

	private async loadPersisted(): Promise<RegistryPluginEntry[] | null> {
		if (!this.store) return null;

		const data = await this.store
			.getItem<PersistedRegistry>("registry")
			.catch(() => null);

		if (!data) return null;

		if (Date.now() - data.fetchedAt > REGISTRY_TTL_MS) return null;

		return data.plugins;
	}

	private async fetchAndPersist(): Promise<RegistryPluginEntry[]> {
		const plugins = await this.fetchRegistry();
		this.cache = plugins;

		if (plugins.length > 0 && this.store) {
			await this.store
				.setItem<PersistedRegistry>("registry", {
					plugins,
					fetchedAt: Date.now(),
				})
				.catch(() => {});
		}

		return plugins;
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
