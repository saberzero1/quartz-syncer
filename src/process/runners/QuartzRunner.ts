import { Platform } from "obsidian";
import type { ProcessResult } from "../types";
import type { ProcessRunner, ProcessStartResult } from "../ProcessRunner";

export type QuartzRunnerResult<T> =
	| { ok: true; data: T; processResult: ProcessResult }
	| { ok: false; error: string; processResult?: ProcessResult };

export type QuartzServeResult =
	| {
			ok: true;
			process: ProcessStartResult["process"];
			result: ProcessStartResult["result"];
		}
	| { ok: false; error: string; process: null; result?: Promise<ProcessResult> };

export type QuartzRunnerOptions = {
	cwd?: string;
	port?: number;
	signal?: AbortSignal;
	onStdout?: (line: string) => void;
	onStderr?: (line: string) => void;
};

export class QuartzRunner {
	private runner: ProcessRunner;
	private cwd?: string;

	constructor(runner: ProcessRunner, cwd?: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	private resolveCwd(cwd?: string): string | null {
		return cwd ?? this.cwd ?? null;
	}

	async update(
		options?: QuartzRunnerOptions | string,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const resolvedOptions =
			typeof options === "string" ? { cwd: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const config = {
			binary: "npx" as const,
			args: ["quartz", "update"],
			cwd,
		};
		const result = await this.runner.run({
			...config,
			...(resolvedOptions?.signal ? { signal: resolvedOptions.signal } : {}),
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
				error: result.error ?? result.stderr ?? "quartz update failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginAdd(
		source: string,
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const config = {
			binary: "npx" as const,
			args: ["quartz", "plugin", "add", source],
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
				error: result.error ?? result.stderr ?? "quartz plugin add failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginRemove(
		name: string,
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const config = {
			binary: "npx" as const,
			args: ["quartz", "plugin", "remove", name],
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
				error: result.error ?? result.stderr ?? "quartz plugin remove failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async build(
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const config = {
			binary: "npx" as const,
			args: ["quartz", "build"],
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
				error: result.error ?? result.stderr ?? "quartz build failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	serve(options?: QuartzRunnerOptions | number): QuartzServeResult {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only", process: null };
		}
		const resolvedOptions =
			typeof options === "number" ? { port: options } : options;
		const cwd = this.resolveCwd(resolvedOptions?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set", process: null };
		}
		const args = resolvedOptions?.port
			? [
					"quartz",
					"build",
					"--serve",
					"--port",
					String(resolvedOptions.port),
				]
			: ["quartz", "build", "--serve"];
		const config = {
			binary: "npx" as const,
			args,
			cwd,
		};
		const start = this.runner.start({
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
		if (!start.process) {
			return {
				ok: false,
				error: "Failed to start quartz serve",
				process: null,
				result: start.result,
			};
		}
		return { ok: true, process: start.process, result: start.result };
	}
}
