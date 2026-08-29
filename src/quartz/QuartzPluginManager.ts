import type {
	QuartzV5Config,
	QuartzPluginEntry,
	QuartzPluginSource,
} from "./QuartzConfigTypes";
import {
	getPluginName,
	getPluginSourceKey,
	isObjectSource,
} from "./QuartzPluginUtils";
import type { QuartzRunner } from "src/process/runners/QuartzRunner";

export const DEFAULT_ORDER = 50;

export class QuartzPluginManager {
	async installPlugin(
		config: QuartzV5Config,
		source: QuartzPluginSource,
		options?: {
			runner?: QuartzRunner | null;
			cwd?: string;
			entryOptions?: Partial<
				Pick<QuartzPluginEntry, "enabled" | "order" | "options">
			>;
		},
	): Promise<QuartzPluginEntry> {
		if (options?.runner && options.cwd && !isObjectSource(source)) {
			const result = await options.runner.pluginAdd(source, {
				cwd: options.cwd,
			});
			if (!result.ok) {
				throw new Error(result.error);
			}
		}

		return this.addPlugin(config, source, options?.entryOptions);
	}

	async uninstallPlugin(
		config: QuartzV5Config,
		sourceKey: string,
		options?: {
			runner?: QuartzRunner | null;
			cwd?: string;
		},
	): Promise<QuartzPluginEntry> {
		if (options?.runner && options.cwd) {
			const entry = this.findPlugin(config, sourceKey);
			if (!entry) {
				throw new Error(`Plugin "${sourceKey}" not found.`);
			}
			const name = getPluginName(entry.source);
			const result = await options.runner.pluginRemove(name, {
				cwd: options.cwd,
			});
			if (!result.ok) {
				throw new Error(result.error);
			}
		}

		return this.removePlugin(config, sourceKey);
	}

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
		if (!removed) {
			throw new Error(
				`Plugin "${sourceKey}" could not be removed from the configuration.`,
			);
		}

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
