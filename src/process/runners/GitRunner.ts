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

export type GitRunnerOptions = {
	cwd?: string;
	signal?: AbortSignal;
	onStdout?: (line: string) => void;
	onStderr?: (line: string) => void;
};

export class GitRunner {
	private runner: ProcessRunner;
	private cwd?: string;

	constructor(runner: ProcessRunner, cwd?: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	private resolveCwd(cwd?: string): string | null {
		return cwd ?? this.cwd ?? null;
	}

	async version(
		options?: GitRunnerOptions,
	): Promise<GitRunnerResult<{ version: string | null }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "git" as const,
			args: ["--version"],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(options?.signal ? { signal: options.signal } : {}),
			...(options?.onStdout ? { onStdout: options.onStdout } : {}),
			...(options?.onStderr ? { onStderr: options.onStderr } : {}),
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error:
					result.error ??
					result.stderr ??
					"Failed to get git version",
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
		options?: GitRunnerOptions | string,
	): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "git" as const,
			args: ["clone", url, dest],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(resolvedOptions?.signal
				? { signal: resolvedOptions.signal }
				: {}),
			...(resolvedOptions?.onStdout
				? { onStdout: resolvedOptions.onStdout }
				: {}),
			...(resolvedOptions?.onStderr
				? { onStderr: resolvedOptions.onStderr }
				: {}),
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

	async pull(
		options?: GitRunnerOptions | string,
	): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "git" as const,
			args: ["pull"],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(resolvedOptions?.signal
				? { signal: resolvedOptions.signal }
				: {}),
			...(resolvedOptions?.onStdout
				? { onStdout: resolvedOptions.onStdout }
				: {}),
			...(resolvedOptions?.onStderr
				? { onStderr: resolvedOptions.onStderr }
				: {}),
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

	async push(
		options?: GitRunnerOptions | string,
	): Promise<GitRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "git" as const,
			args: ["push"],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(resolvedOptions?.signal
				? { signal: resolvedOptions.signal }
				: {}),
			...(resolvedOptions?.onStdout
				? { onStdout: resolvedOptions.onStdout }
				: {}),
			...(resolvedOptions?.onStderr
				? { onStderr: resolvedOptions.onStderr }
				: {}),
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

	async status(
		options?: GitRunnerOptions | string,
	): Promise<GitRunnerResult<{ entries: GitStatusEntry[] }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "git" as const,
			args: ["status", "--porcelain"],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(resolvedOptions?.signal
				? { signal: resolvedOptions.signal }
				: {}),
			...(resolvedOptions?.onStdout
				? { onStdout: resolvedOptions.onStdout }
				: {}),
			...(resolvedOptions?.onStderr
				? { onStderr: resolvedOptions.onStderr }
				: {}),
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
