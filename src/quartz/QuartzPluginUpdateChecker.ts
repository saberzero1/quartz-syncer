import type { GitAuth } from "src/models/settings";
import type {
	QuartzPluginEntry,
	QuartzLockFile,
	QuartzLockFileEntry,
} from "./QuartzConfigTypes";
import {
	resolveSourceToGitUrl,
	getPluginSourceKey,
	getSourceRef,
} from "./QuartzPluginUtils";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import Logger from "js-logger";

const logger = Logger.get("quartz-plugin-update-checker");

export interface PluginUpdateStatus {
	name: string;
	sourceKey: string;
	lockedCommit: string | null;
	remoteCommit: string | null;
	hasUpdate: boolean;
	error?: string;
}

export class QuartzPluginUpdateChecker {
	private auth: GitAuth;
	private corsProxyUrl?: string;

	constructor(auth: GitAuth, corsProxyUrl?: string) {
		this.auth = auth;
		this.corsProxyUrl = corsProxyUrl;
	}

	async checkUpdates(
		plugins: QuartzPluginEntry[],
		lockFile: QuartzLockFile | null,
	): Promise<PluginUpdateStatus[]> {
		const lockPlugins = lockFile?.plugins ?? {};

		const checks = plugins.map((plugin) =>
			this.checkSinglePlugin(plugin, lockPlugins),
		);

		return Promise.all(checks);
	}

	private async checkSinglePlugin(
		plugin: QuartzPluginEntry,
		lockPlugins: Record<string, QuartzLockFileEntry>,
	): Promise<PluginUpdateStatus> {
		const sourceKey = getPluginSourceKey(plugin.source);
		const lockEntry = lockPlugins[sourceKey];
		const lockedCommit = lockEntry?.commit ?? null;

		if (!lockedCommit) {
			return {
				name: sourceKey,
				sourceKey,
				lockedCommit: null,
				remoteCommit: null,
				hasUpdate: false,
			};
		}

		try {
			const gitUrl = resolveSourceToGitUrl(plugin.source);
			const ref = getSourceRef(plugin.source) ?? undefined;

			const remoteCommit =
				await RepositoryConnection.fetchRemoteHeadCommit(
					gitUrl,
					this.auth,
					ref,
					this.corsProxyUrl,
				);

			if (!remoteCommit) {
				return {
					name: sourceKey,
					sourceKey,
					lockedCommit,
					remoteCommit: null,
					hasUpdate: false,
					error: "Could not reach remote",
				};
			}

			return {
				name: sourceKey,
				sourceKey,
				lockedCommit,
				remoteCommit,
				hasUpdate: remoteCommit !== lockedCommit,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.debug(`Update check failed for ${sourceKey}`, error);

			return {
				name: sourceKey,
				sourceKey,
				lockedCommit,
				remoteCommit: null,
				hasUpdate: false,
				error: message,
			};
		}
	}
}
