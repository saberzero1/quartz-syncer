import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import type { GitAuth } from "src/models/settings";
import { requestUrl } from "obsidian";

const UPSTREAM_PACKAGE_JSON_URL =
	"https://raw.githubusercontent.com/jackyzha0/quartz/v5/package.json";

export const UPSTREAM_REPO_URL = "https://github.com/jackyzha0/quartz.git";
export const UPSTREAM_BRANCH = "v5";
export const UPSTREAM_AUTH: GitAuth = { type: "none" };

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
			console.debug("Could not read current Quartz version", error);
		}

		let upstreamVersion: string | null = null;

		try {
			upstreamVersion = await this.fetchUpstreamVersion();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.debug("Could not reach upstream Quartz", error);

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

			console.debug(
				`Upstream HEAD commit: ${latestUpstreamSha ?? "null"}`,
			);
		} catch (error) {
			console.debug("Could not fetch upstream HEAD commit SHA", error);
		}

		let hasNewerCommits = false;

		if (latestUpstreamSha) {
			console.debug(
				`Checking if ${latestUpstreamSha.slice(
					0,
					7,
				)} exists in user repo history`,
			);

			const foundInHistory =
				await this.userRepo.hasCommitInHistory(latestUpstreamSha);
			hasNewerCommits = !foundInHistory;

			console.debug(
				`Commit ${latestUpstreamSha.slice(0, 7)} ${
					foundInHistory ? "found" : "NOT found"
				} in user repo`,
			);
		} else {
			console.debug(
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
			console.debug("Starting Quartz upgrade from upstream");

			const result = await this.userRepo.upgradeFromUpstream(
				UPSTREAM_REPO_URL,
				UPSTREAM_BRANCH,
			);

			if (result.alreadyMerged) {
				console.debug("Quartz is already up to date with upstream");

				return { success: true, alreadyMerged: true, oid: result.oid };
			}

			console.debug(
				`Quartz upgraded successfully to ${result.oid.slice(0, 7)}`,
			);

			return { success: true, oid: result.oid, alreadyMerged: false };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);

			const isConflict =
				message.includes("Merge conflicts in:") ||
				message.includes("Cannot auto-upgrade:") ||
				message.includes("MergeNotSupportedError") ||
				message.includes("MergeConflictError") ||
				message.includes("Merges with conflicts");

			if (isConflict) {
				console.debug(`Upgrade aborted: ${message}`);

				return {
					success: false,
					error: `${message}. No changes were made. Run \`npx quartz upgrade\` manually to resolve conflicts.`,
				};
			}

			console.error("Quartz upgrade failed", error);

			return {
				success: false,
				error: `Upgrade failed: ${message}`,
			};
		}
	}

	private async fetchUpstreamVersion(): Promise<string | null> {
		const response = await requestUrl({ url: UPSTREAM_PACKAGE_JSON_URL });

		if (response.status < 200 || response.status >= 300) return null;

		const data = response.json as { version?: string };

		return data.version ?? null;
	}
}
