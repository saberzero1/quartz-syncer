import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
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

export class QuartzPluginManifestService {
	private auth: GitAuth;
	private corsProxyUrl?: string;
	private cache: Map<string, QuartzPluginManifest | null> = new Map();

	constructor(auth: GitAuth, corsProxyUrl?: string) {
		this.auth = auth;
		this.corsProxyUrl = corsProxyUrl;
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
				const { defaultBranch } =
					await RepositoryConnection.fetchRemoteBranches(
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

			const { defaultBranch } =
				await RepositoryConnection.fetchRemoteBranches(
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
			const repo = new RepositoryConnection({
				gitSettings: {
					remoteUrl: url,
					branch: ref,
					auth: this.auth,
					corsProxyUrl: this.corsProxyUrl,
				},
				contentFolder: "content",
				vaultPath: "/",
			});

			const packageJsonPath = subdir
				? `${subdir}/package.json`
				: "package.json";

			const file = await repo.getRawFile(packageJsonPath);

			if (!file) {
				this.cache.set(cacheKey, null);

				return null;
			}

			/* eslint-disable-next-line no-undef -- Buffer polyfill available at runtime */
			const content = Buffer.from(file.content, "base64").toString(
				"utf-8",
			);

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
