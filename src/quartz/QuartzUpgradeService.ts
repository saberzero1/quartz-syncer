import type { GitAuth } from "src/models/settings";
import type { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzVersionDetector } from "./QuartzVersionDetector";
import Logger from "js-logger";

const logger = Logger.get("quartz-upgrade-service");

const UPSTREAM_QUARTZ_URL = "https://github.com/jackyzha0/quartz.git";
const UPSTREAM_BRANCH = "v4";

export type FetchRemoteHeadCommitFn = (
	remoteUrl: string,
	auth: GitAuth,
	ref?: string,
	corsProxyUrl?: string,
) => Promise<string | null>;

export interface QuartzUpgradeStatus {
	currentVersion: string | null;
	currentCommit: string | null;
	upstreamCommit: string | null;
	hasUpgrade: boolean;
	error?: string;
}

export class QuartzUpgradeService {
	private userRepo: RepositoryConnection;
	private auth: GitAuth;
	private corsProxyUrl?: string;
	private fetchRemoteHeadCommit: FetchRemoteHeadCommitFn;

	constructor(
		userRepo: RepositoryConnection,
		auth: GitAuth,
		fetchRemoteHeadCommitFn: FetchRemoteHeadCommitFn,
		corsProxyUrl?: string,
	) {
		this.userRepo = userRepo;
		this.auth = auth;
		this.fetchRemoteHeadCommit = fetchRemoteHeadCommitFn;
		this.corsProxyUrl = corsProxyUrl;
	}

	async checkForUpgrade(): Promise<QuartzUpgradeStatus> {
		let currentVersion: string | null = null;
		let currentCommit: string | null = null;

		try {
			currentVersion =
				await QuartzVersionDetector.getQuartzPackageVersion(
					this.userRepo,
				);
		} catch (error) {
			logger.debug("Could not read current Quartz version", error);
		}

		try {
			const latestCommitInfo = await this.userRepo.getLatestCommit();
			currentCommit = latestCommitInfo?.sha ?? null;
		} catch (error) {
			logger.debug("Could not read current commit", error);
		}

		let upstreamCommit: string | null = null;

		try {
			upstreamCommit = await this.fetchRemoteHeadCommit(
				UPSTREAM_QUARTZ_URL,
				this.auth,
				UPSTREAM_BRANCH,
				this.corsProxyUrl,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			logger.debug("Could not reach upstream Quartz", error);

			return {
				currentVersion,
				currentCommit,
				upstreamCommit: null,
				hasUpgrade: false,
				error: `Could not reach upstream Quartz: ${message}`,
			};
		}

		if (!upstreamCommit) {
			return {
				currentVersion,
				currentCommit,
				upstreamCommit: null,
				hasUpgrade: false,
				error: "Could not determine upstream Quartz version",
			};
		}

		const hasUpgrade =
			currentCommit !== null && upstreamCommit !== currentCommit;

		return {
			currentVersion,
			currentCommit,
			upstreamCommit,
			hasUpgrade,
		};
	}
}
