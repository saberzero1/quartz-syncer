import { Platform } from "obsidian";
import type { ProcessResult } from "../types";
import type { ProcessRunner } from "../ProcessRunner";

export type NpmRunnerResult<T> =
	| { ok: true; data: T; processResult: ProcessResult }
	| { ok: false; error: string; processResult?: ProcessResult };

export type NpmRunnerOptions = {
	cwd?: string;
	signal?: AbortSignal;
	onStdout?: (line: string) => void;
	onStderr?: (line: string) => void;
};

export class NpmRunner {
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
		options?: NpmRunnerOptions,
	): Promise<NpmRunnerResult<{ version: string | null }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const config = {
			binary: "npm" as const,
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
					"Failed to get npm version",
				processResult: result,
			};
		}
		return {
			ok: true,
			data: { version: result.stdout.trim() || null },
			processResult: result,
		};
	}

	async install(
		options?: NpmRunnerOptions | string,
	): Promise<NpmRunnerResult<Record<string, never>>> {
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
			binary: "npm" as const,
			args: ["install"],
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
				error: result.error ?? result.stderr ?? "npm install failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async update(
		pkg?: string,
		options?: NpmRunnerOptions | string,
	): Promise<NpmRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Working directory not set" };
		}
		const args = pkg ? ["update", pkg] : ["update"];
		const config = {
			binary: "npm" as const,
			args,
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
				error: result.error ?? result.stderr ?? "npm update failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}
}
