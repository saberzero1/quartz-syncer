import type QuartzSyncer from "src/main";
import { dropCaches, surveyForeignCaches } from "src/cache/LegacyCacheCleanup";
import { buildFsName } from "src/git/backends/GitFsName";

/** Preserve the exact survey list for review before requesting deletion. */
export interface ForeignCacheReport {
	names: string[];
}

/** Expose partial failures so every cleanup surface can report them honestly. */
export interface ForeignCacheResult {
	dropped: string[];
	failed: string[];
}

/**
 * Share explicit cache maintenance across settings, CLI and operability without
 * widening the conservative startup sweep or coupling deletion to enumeration.
 */
export class CacheMaintenanceService {
	constructor(private plugin: QuartzSyncer) {}

	/** Protect this vault's current caches, including its remote-dependent clone. */
	async survey(): Promise<ForeignCacheReport> {
		const { app, settings, manifest, appVersion } = this.plugin;
		const liveExtra =
			typeof settings.gitRemoteUrl === "string" &&
			settings.gitRemoteUrl !== ""
				? [
						buildFsName(
							app.appId,
							settings.gitRemoteUrl,
							settings.gitBranch,
						),
					]
				: [];
		const names = await surveyForeignCaches(
			{
				appId: app.appId,
				vaultName: app.vault.getName(),
				pluginId: manifest.id,
				version: appVersion,
			},
			liveExtra,
		);
		return { names };
	}

	/** Never re-survey: consent covers only the names the caller reviewed. */
	async drop(names: readonly string[]): Promise<ForeignCacheResult> {
		return dropCaches(names);
	}
}
