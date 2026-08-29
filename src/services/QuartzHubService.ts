import { Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import type { BinaryInfo } from "src/process/types";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import {
	externalFileExistsSync,
	externalIsDirectorySync,
	expandTilde,
	joinPath,
} from "src/utils/external-fs";

export interface HubStatus {
	repoPath: string;
	repoValid: boolean;
	repoMessage: string;
	quartzVersion: QuartzVersion | null;
	quartzPackageVersion: string | null;
	binaries: BinaryInfo[];
	isServing: boolean;
	systemCommandsEnabled: boolean;
}

export interface RepoValidation {
	ok: boolean;
	message: string;
}

export class QuartzHubService {
	constructor(private plugin: QuartzSyncer) {}

	async getStatus(): Promise<HubStatus> {
		const repoPath = this.plugin.settings.quartzRepoPath;
		const validation = this.validateRepoPath(repoPath);
		let quartzVersion: QuartzVersion | null = null;
		let quartzPackageVersion: string | null = null;
		let binaries: BinaryInfo[] = [];

		if (validation.ok) {
			const resolvedPath = expandTilde(repoPath);
			const repo = new LocalFileSource(resolvedPath);

			try {
				quartzVersion =
					await QuartzVersionDetector.detectQuartzVersion(repo);
			} catch {
				quartzVersion = null;
			}

			try {
				quartzPackageVersion =
					await QuartzVersionDetector.getQuartzPackageVersion(repo);
			} catch {
				quartzPackageVersion = null;
			}
		}

		if (this.plugin.binaryDetector) {
			try {
				binaries = await this.plugin.binaryDetector.detectAll();
			} catch {
				binaries = [];
			}
		}

		return {
			repoPath,
			repoValid: validation.ok,
			repoMessage: validation.message,
			quartzVersion,
			quartzPackageVersion,
			binaries,
			isServing: this.plugin.quartzRunner?.isServing ?? false,
			systemCommandsEnabled: this.plugin.settings.enableSystemCommands,
		};
	}

	validateRepoPath(path: string): RepoValidation {
		if (!path.trim()) {
			return {
				ok: false,
				message: "Set a local Quartz repository path.",
			};
		}

		if (!Platform.isDesktopApp) {
			return {
				ok: false,
				message: "Local repo path is only available on desktop.",
			};
		}

		const resolved = expandTilde(path);

		if (!externalFileExistsSync(resolved)) {
			return { ok: false, message: "Path does not exist." };
		}
		if (!externalIsDirectorySync(resolved)) {
			return { ok: false, message: "Path is not a directory." };
		}

		const candidates = [
			"quartz.config.ts",
			"quartz.config.js",
			"quartz.config.mjs",
			"quartz.config.json",
			"quartz.config.yaml",
			"quartz.config.yml",
			"quartz.config.default.yaml",
		];
		const hasConfig = candidates.some((candidate) =>
			externalFileExistsSync(joinPath(resolved, candidate)),
		);

		if (!hasConfig) {
			return {
				ok: false,
				message: "Quartz config not found in this directory.",
			};
		}

		return { ok: true, message: "Quartz repo detected." };
	}

	canRunActions(): { ok: boolean; reason: string } {
		const validation = this.validateRepoPath(
			this.plugin.settings.quartzRepoPath,
		);
		if (!validation.ok) {
			return { ok: false, reason: validation.message };
		}
		if (!this.plugin.settings.enableSystemCommands) {
			return {
				ok: false,
				reason: "System commands are disabled.",
			};
		}
		if (!this.plugin.quartzRunner) {
			return { ok: false, reason: "Quartz runner unavailable." };
		}
		if (this.plugin.processRunner?.isDisabled) {
			return {
				ok: false,
				reason: "System commands are temporarily disabled.",
			};
		}
		return { ok: true, reason: "" };
	}
}
