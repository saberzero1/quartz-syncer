import { Platform } from "obsidian";
import type { ProcessResult } from "../types";
import type { ProcessRunner } from "../ProcessRunner";

export type GitRunnerResult<T> =
	| { ok: true; data: T; processResult: ProcessResult }
	| { ok: false; error: string; processResult?: ProcessResult };

export type GitStatusEntry = {
	status: string;
	path: string;
	raw: string;
};

export class GitRunner {
	private runner: ProcessRunner;
	private cwd: string;

	constructor(runner: ProcessRunner, cwd: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	async version(): Promise<GitRunnerResult<{ version: string | null }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "git",
			args: ["--version"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "Failed to get git version",
				processResult: result,
			};
		}
		const match = result.stdout.trim().match(/git version\s+([^\s]+)/i);
		return {
			ok: true,
			data: { version: match?.[1] ?? result.stdout.trim() ?? null },
			processResult: result,
		};
	}

	async clone(
		url: string,
		dest: string,
	): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "git",
			args: ["clone", url, dest],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "git clone failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pull(): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "git",
			args: ["pull"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "git pull failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async push(): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "git",
			args: ["push"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "git push failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async status(): Promise<GitRunnerResult<{ entries: GitStatusEntry[] }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "git",
			args: ["status", "--porcelain"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "git status failed",
				processResult: result,
			};
		}
		const entries = result.stdout
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => {
				const status = line.slice(0, 2).trim();
				const path = line.slice(3).trim();
				return { status, path, raw: line };
			});
		return { ok: true, data: { entries }, processResult: result };
	}
}
