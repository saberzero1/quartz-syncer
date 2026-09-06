import type QuartzSyncer from "src/main";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";

const VERSION_TTL_MS = 300_000;

export const V4_MANAGEMENT_UNSUPPORTED =
	"Quartz v4 detected. Publishing notes and media is supported; Quartz site management (config, plugins, upgrades) requires Quartz v5.";

export const V4_ARBITRARY_PUBLISH_BLOCKED =
	"Quartz v4 detected. Publishing files outside the content folder is disabled to avoid modifying the Quartz v4 site.";

/**
 * Resolves and caches the Quartz version of the configured repository.
 *
 * Detection needs repository I/O, so results are cached and single-flighted;
 * callers can gate on it without paying a network round trip each time.
 */
export class QuartzCompatibility {
	private cached: { version: QuartzVersion; time: number } | null = null;
	private inflight: Promise<QuartzVersion> | null = null;

	constructor(private plugin: QuartzSyncer) {}

	invalidate(): void {
		this.cached = null;
	}

	async getVersion(): Promise<QuartzVersion> {
		if (this.cached && Date.now() - this.cached.time < VERSION_TTL_MS) {
			return this.cached.version;
		}

		if (this.inflight) return this.inflight;

		this.inflight = this.detect()
			.then((version) => {
				this.cached = { version, time: Date.now() };

				return version;
			})
			.catch(() => "unknown" as QuartzVersion)
			.finally(() => {
				this.inflight = null;
			});

		return this.inflight;
	}

	private async detect(): Promise<QuartzVersion> {
		const repo = createRepositoryAdapter(this.plugin);

		if (!repo) return "unknown";

		return QuartzVersionDetector.detectQuartzVersion(repo);
	}

	/**
	 * Whether the repository is positively identified as Quartz v4.
	 *
	 * Publishing must keep working when detection is unavailable (offline,
	 * unconfigured), so content-path guards use this rather than "not v5".
	 */
	async isConfirmedV4(): Promise<boolean> {
		return (await this.getVersion()) === "v4";
	}

	/**
	 * Whether v5-only site management may run.
	 *
	 * Requires positive v5 detection: these paths write Quartz config, plugin
	 * manifests and lockfiles, so an unidentified repository is not eligible.
	 */
	async supportsV5Management(): Promise<boolean> {
		const version = await this.getVersion();

		return version === "v5-yaml" || version === "v5-json";
	}
}
