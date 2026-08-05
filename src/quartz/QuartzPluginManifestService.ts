import type {
	QuartzPluginManifest,
	QuartzPluginSource,
} from "./QuartzConfigTypes";
import {
	getSourceRef,
	isObjectSource,
	resolveSourceToGitUrl,
} from "./QuartzPluginUtils";
import type { GitAuth } from "src/models/settings";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { fetchRemoteBranches } from "src/git/GitRemoteUtils";

type RemoteFileSourceFactory = (options: {
	remoteUrl: string;
	branch: string;
	auth: GitAuth;
	corsProxyUrl?: string;
}) => QuartzFileSource;

export class QuartzPluginManifestService {
	private auth: GitAuth;
	private corsProxyUrl?: string;
	private cache: Map<string, QuartzPluginManifest | null> = new Map();
	private createRemoteFileSource: RemoteFileSourceFactory;

	constructor(
		auth: GitAuth,
		corsProxyUrl?: string,
		createRemoteFileSource?: RemoteFileSourceFactory,
	) {
		this.auth = auth;
		this.corsProxyUrl = corsProxyUrl;
		this.createRemoteFileSource =
			createRemoteFileSource ??
			(() => {
				throw new Error("Remote file source factory is not configured");
			});
	}

	async fetchManifest(
		source: QuartzPluginSource,
	): Promise<QuartzPluginManifest | null> {
		const cacheKey =
			typeof source === "string" ? source : JSON.stringify(source);

		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey) ?? null;
		}

		const url = resolveSourceToGitUrl(source);
		const subdir = isObjectSource(source) ? source.subdir : undefined;

		try {
			let ref = getSourceRef(source);

			if (!ref) {
				const { defaultBranch } = await fetchRemoteBranches(
					url,
					this.auth,
					this.corsProxyUrl,
				);
				ref = defaultBranch ?? "main";
			}

			const manifest = await this.fetchManifestFromRef(
				url,
				ref,
				cacheKey,
				subdir,
			);

			if (manifest !== undefined) {
				return manifest;
			}

			const { defaultBranch } = await fetchRemoteBranches(
				url,
				this.auth,
				this.corsProxyUrl,
			);

			if (defaultBranch && defaultBranch !== ref) {
				const fallback = await this.fetchManifestFromRef(
					url,
					defaultBranch,
					cacheKey,
					subdir,
				);

				if (fallback !== undefined) {
					return fallback;
				}
			}

			this.cache.set(cacheKey, null);

			return null;
		} catch (error) {
			console.debug("Could not fetch plugin manifest", error);
			this.cache.set(cacheKey, null);

			return null;
		}
	}

	private async fetchManifestFromRef(
		url: string,
		ref: string,
		cacheKey: string,
		subdir?: string,
	): Promise<QuartzPluginManifest | null | undefined> {
		try {
			const repo = this.createRemoteFileSource({
				remoteUrl: url,
				branch: ref,
				auth: this.auth,
				corsProxyUrl: this.corsProxyUrl,
			});

			const packageJsonPath = subdir
				? `${subdir}/package.json`
				: "package.json";

			const content = await repo.readFile(packageJsonPath);

			if (!content) {
				this.cache.set(cacheKey, null);

				return null;
			}

			const packageJson = JSON.parse(content) as {
				quartz?: QuartzPluginManifest;
			};

			const manifest =
				(packageJson.quartz as QuartzPluginManifest) ?? null;

			this.cache.set(cacheKey, manifest);

			return manifest;
		} catch {
			return undefined;
		}
	}

	clearCache(): void {
		this.cache.clear();
	}
}
