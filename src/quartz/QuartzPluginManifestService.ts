import { Base64 } from "js-base64";
import Logger from "js-logger";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type {
	QuartzPluginManifest,
	QuartzPluginSource,
} from "./QuartzConfigTypes";
import type { GitAuth } from "src/models/settings";

const logger = Logger.get("quartz-plugin-manifest-service");

function resolveSourceToUrl(
	source: QuartzPluginSource,
): { url: string; subdir?: string } | null {
	if (typeof source === "string") {
		if (source.startsWith("github:")) {
			const repoPath = source.replace("github:", "").split("#")[0];

			return { url: `https://github.com/${repoPath}.git` };
		}

		if (source.startsWith("git+https://")) {
			return { url: source.replace("git+", "").split("#")[0] };
		}

		if (source.startsWith("https://")) {
			return { url: source.split("#")[0] };
		}

		return null;
	}

	const obj = source;

	if (obj.repo.startsWith("github:")) {
		const repoPath = obj.repo.replace("github:", "").split("#")[0];

		return {
			url: `https://github.com/${repoPath}.git`,
			subdir: obj.subdir,
		};
	}

	return { url: obj.repo.split("#")[0], subdir: obj.subdir };
}

function resolveRef(source: QuartzPluginSource): string | undefined {
	if (typeof source === "string") {
		const hashIndex = source.indexOf("#");

		return hashIndex >= 0 ? source.slice(hashIndex + 1) : undefined;
	}

	return source.ref;
}

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

		const resolved = resolveSourceToUrl(source);

		if (!resolved) {
			this.cache.set(cacheKey, null);

			return null;
		}

		try {
			let ref = resolveRef(source);

			if (!ref) {
				const { defaultBranch } =
					await RepositoryConnection.fetchRemoteBranches(
						resolved.url,
						this.auth,
						this.corsProxyUrl,
					);
				ref = defaultBranch ?? "main";
			}

			const manifest = await this.fetchManifestFromRef(
				resolved,
				ref,
				cacheKey,
			);

			if (manifest !== undefined) {
				return manifest;
			}

			const { defaultBranch } =
				await RepositoryConnection.fetchRemoteBranches(
					resolved.url,
					this.auth,
					this.corsProxyUrl,
				);

			if (defaultBranch && defaultBranch !== ref) {
				const fallback = await this.fetchManifestFromRef(
					resolved,
					defaultBranch,
					cacheKey,
				);

				if (fallback !== undefined) {
					return fallback;
				}
			}

			this.cache.set(cacheKey, null);

			return null;
		} catch (error) {
			logger.debug("Could not fetch plugin manifest", error);
			this.cache.set(cacheKey, null);

			return null;
		}
	}

	private async fetchManifestFromRef(
		resolved: { url: string; subdir?: string },
		ref: string,
		cacheKey: string,
	): Promise<QuartzPluginManifest | null | undefined> {
		try {
			const repo = new RepositoryConnection({
				gitSettings: {
					remoteUrl: resolved.url,
					branch: ref,
					auth: this.auth,
					corsProxyUrl: this.corsProxyUrl,
				},
				contentFolder: "content",
				vaultPath: "/",
			});

			const packageJsonPath = resolved.subdir
				? `${resolved.subdir}/package.json`
				: "package.json";

			const file = await repo.getRawFile(packageJsonPath);

			if (!file) {
				this.cache.set(cacheKey, null);

				return null;
			}

			const content = Base64.decode(file.content);

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
