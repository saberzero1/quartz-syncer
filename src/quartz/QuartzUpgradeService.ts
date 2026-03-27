import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import Logger from "js-logger";

const logger = Logger.get("quartz-upgrade-service");

const UPSTREAM_PACKAGE_JSON_URL =
	"https://raw.githubusercontent.com/jackyzha0/quartz/v5/package.json";

export interface QuartzUpgradeStatus {
	currentVersion: string | null;
	upstreamVersion: string | null;
	hasUpgrade: boolean;
	error?: string;
}

export class QuartzUpgradeService {
	private userRepo: RepositoryConnection;

	constructor(userRepo: RepositoryConnection) {
		this.userRepo = userRepo;
	}

	async checkForUpgrade(): Promise<QuartzUpgradeStatus> {
		let currentVersion: string | null = null;

		try {
			currentVersion =
				await QuartzVersionDetector.getQuartzPackageVersion(
					this.userRepo,
				);
		} catch (error) {
			logger.debug("Could not read current Quartz version", error);
		}

		let upstreamVersion: string | null = null;

		try {
			upstreamVersion = await this.fetchUpstreamVersion();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.debug("Could not reach upstream Quartz", error);

			return {
				currentVersion,
				upstreamVersion: null,
				hasUpgrade: false,
				error: `Could not reach upstream Quartz: ${message}`,
			};
		}

		if (!upstreamVersion) {
			return {
				currentVersion,
				upstreamVersion: null,
				hasUpgrade: false,
				error: "Could not determine upstream Quartz version",
			};
		}

		const hasUpgrade =
			currentVersion !== null && upstreamVersion !== currentVersion;

		return {
			currentVersion,
			upstreamVersion,
			hasUpgrade,
		};
	}

	private async fetchUpstreamVersion(): Promise<string | null> {
		const response = await fetch(UPSTREAM_PACKAGE_JSON_URL);

		if (!response.ok) return null;

		const data = (await response.json()) as { version?: string };

		return data.version ?? null;
	}
}
