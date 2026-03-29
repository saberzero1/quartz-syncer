import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import type { GitAuth } from "src/models/settings";
import Logger from "js-logger";

const logger = Logger.get("quartz-upgrade-service");

const UPSTREAM_PACKAGE_JSON_URL =
	"https://raw.githubusercontent.com/jackyzha0/quartz/v5/package.json";

const UPSTREAM_REPO_URL = "https://github.com/jackyzha0/quartz.git";
const UPSTREAM_BRANCH = "v5";
const UPSTREAM_AUTH: GitAuth = { type: "none" };

export interface QuartzUpgradeStatus {
	currentVersion: string | null;
	upstreamVersion: string | null;
	hasUpgrade: boolean;
	latestUpstreamSha: string | null;
	hasNewerCommits: boolean;
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
				latestUpstreamSha: null,
				hasNewerCommits: false,
				error: `Could not reach upstream Quartz: ${message}`,
			};
		}

		if (!upstreamVersion) {
			return {
				currentVersion,
				upstreamVersion: null,
				hasUpgrade: false,
				latestUpstreamSha: null,
				hasNewerCommits: false,
				error: "Could not determine upstream Quartz version",
			};
		}

		const hasUpgrade =
			currentVersion !== null && upstreamVersion !== currentVersion;

		let latestUpstreamSha: string | null = null;

		try {
			latestUpstreamSha =
				await RepositoryConnection.fetchRemoteHeadCommit(
					UPSTREAM_REPO_URL,
					UPSTREAM_AUTH,
					UPSTREAM_BRANCH,
				);
			logger.info(`Upstream HEAD commit: ${latestUpstreamSha ?? "null"}`);
		} catch (error) {
			logger.warn("Could not fetch upstream HEAD commit SHA", error);
		}

		let hasNewerCommits = false;

		if (latestUpstreamSha) {
			logger.info(
				`Checking if ${latestUpstreamSha.slice(0, 7)} exists in user repo history`,
			);

			const foundInHistory =
				await this.userRepo.hasCommitInHistory(latestUpstreamSha);
			hasNewerCommits = !foundInHistory;

			logger.info(
				`Commit ${latestUpstreamSha.slice(0, 7)} ${foundInHistory ? "found" : "NOT found"} in user repo`,
			);
		} else {
			logger.warn(
				"Could not determine upstream HEAD SHA, skipping commit check",
			);
		}

		return {
			currentVersion,
			upstreamVersion,
			hasUpgrade,
			latestUpstreamSha,
			hasNewerCommits,
		};
	}

	async performUpgrade(): Promise<{
		success: boolean;
		oid?: string;
		alreadyMerged?: boolean;
		error?: string;
	}> {
		try {
			logger.info("Starting Quartz upgrade from upstream");

			const result = await this.userRepo.upgradeFromUpstream(
				UPSTREAM_REPO_URL,
				UPSTREAM_BRANCH,
			);

			if (result.alreadyMerged) {
				logger.info("Quartz is already up to date with upstream");

				return { success: true, alreadyMerged: true, oid: result.oid };
			}

			logger.info(
				`Quartz upgraded successfully to ${result.oid.slice(0, 7)}`,
			);

			return { success: true, oid: result.oid, alreadyMerged: false };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);

			const isConflict =
				message.includes("Merge conflicts in:") ||
				message.includes("MergeNotSupportedError") ||
				message.includes("MergeConflictError") ||
				message.includes("Merges with conflicts");

			if (isConflict) {
				logger.warn(`Upgrade aborted: ${message}`);

				return {
					success: false,
					error: `${message}. No changes were made. Run \`npx quartz upgrade\` manually to resolve conflicts.`,
				};
			}

			logger.error("Quartz upgrade failed", error);

			return {
				success: false,
				error: `Upgrade failed: ${message}`,
			};
		}
	}

	private async fetchUpstreamVersion(): Promise<string | null> {
		const response = await fetch(UPSTREAM_PACKAGE_JSON_URL);

		if (!response.ok) return null;

		const data = (await response.json()) as { version?: string };

		return data.version ?? null;
	}
}
