import type {
	QuartzV5Config,
	QuartzPluginEntry,
	QuartzPluginSource,
} from "./QuartzConfigTypes";
import { getPluginSourceKey } from "./QuartzPluginUtils";

const DEFAULT_ORDER = 50;

export class QuartzPluginManager {
	addPlugin(
		config: QuartzV5Config,
		source: QuartzPluginSource,
		options?: Partial<
			Pick<QuartzPluginEntry, "enabled" | "order" | "options">
		>,
	): QuartzPluginEntry {
		const sourceKey = getPluginSourceKey(source);

		const existing = config.plugins.find(
			(p) => getPluginSourceKey(p.source) === sourceKey,
		);

		if (existing) {
			throw new Error(
				`Plugin "${sourceKey}" is already in the configuration.`,
			);
		}

		const entry: QuartzPluginEntry = {
			source,
			enabled: options?.enabled ?? true,
			order: options?.order ?? DEFAULT_ORDER,
			options: options?.options ?? {},
		};

		config.plugins.push(entry);

		return entry;
	}

	removePlugin(config: QuartzV5Config, sourceKey: string): QuartzPluginEntry {
		const index = config.plugins.findIndex(
			(p) => getPluginSourceKey(p.source) === sourceKey,
		);

		if (index === -1) {
			throw new Error(
				`Plugin "${sourceKey}" not found in the configuration.`,
			);
		}

		const [removed] = config.plugins.splice(index, 1);

		return removed;
	}

	findPlugin(
		config: QuartzV5Config,
		sourceKey: string,
	): QuartzPluginEntry | undefined {
		return config.plugins.find(
			(p) => getPluginSourceKey(p.source) === sourceKey,
		);
	}
}
