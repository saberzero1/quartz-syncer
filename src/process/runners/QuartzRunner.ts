import { Platform } from "obsidian";
import { getModule } from "src/utils/external-fs";
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
	| {
			ok: false;
			error: string;
			process: null;
			result?: Promise<ProcessResult>;
	  };

export type QuartzRunnerOptions = {
	cwd?: string;
	port?: number;
	signal?: AbortSignal;
	onStdout?: (line: string) => void;
	onStderr?: (line: string) => void;
	timeout?: number;
};

type ExecFileError = {
	code?: string | number;
	signal?: string | null;
	message?: string;
	killed?: boolean;
};

type ChildProcessModule = {
	execFile(
		file: string,
		args: readonly string[],
		options: {
			cwd?: string;
			timeout?: number;
			shell?: boolean;
			windowsHide?: boolean;
		},
		callback: (
			error: ExecFileError | null,
			stdout: string,
			stderr: string,
		) => void,
	): ProcessStartResult["process"];
};

export type QuartzSyncOptions = QuartzRunnerOptions & {
	commit?: boolean;
	push?: boolean;
	pull?: boolean;
	message?: string;
};

export type QuartzPluginInstallOptions = QuartzRunnerOptions & {
	fromConfig?: boolean;
	latest?: boolean;
	clean?: boolean;
	dryRun?: boolean;
};

export type QuartzPluginConfigOptions = QuartzRunnerOptions & {
	set?: string;
};

export type QuartzPluginPruneOptions = QuartzRunnerOptions & {
	dryRun?: boolean;
};

export class QuartzRunner {
	private runner: ProcessRunner;
	private cwd?: string;
	private serveProcess: ProcessStartResult["process"] | null = null;

	constructor(runner: ProcessRunner, cwd?: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	private resolveCwd(cwd?: string): string | null {
		return cwd ?? this.cwd ?? null;
	}

	private resolveTimeout(timeout?: number): number | undefined {
		if (timeout === undefined) return undefined;
		if (timeout === -1) return 0;
		if (timeout > 0) return timeout;
		return 30000;
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
			...(resolvedOptions?.timeout !== undefined
				? { timeout: resolvedOptions.timeout }
				: {}),
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
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
			...(options?.signal ? { signal: options.signal } : {}),
			...(options?.onStdout ? { onStdout: options.onStdout } : {}),
			...(options?.onStderr ? { onStderr: options.onStderr } : {}),
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error:
					result.error ?? result.stderr ?? "quartz plugin add failed",
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
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
					"quartz plugin remove failed",
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
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
			return {
				ok: false,
				error: "Quartz repo path not set",
				process: null,
			};
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
		this.stopServe();

		let childProcess: ChildProcessModule;
		try {
			childProcess = getModule<ChildProcessModule>("child_process");
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to load child_process",
				process: null,
			};
		}

		const timeout = this.resolveTimeout(resolvedOptions?.timeout);
		let aborted = false;
		let stdoutListener: { flush: () => void } = { flush: () => {} };
		let stderrListener: { flush: () => void } = { flush: () => {} };
		const result = new Promise<ProcessResult>((resolve) => {
			const process = childProcess.execFile(
				"npx",
				args,
				{ cwd, timeout, shell: true, windowsHide: true },
				(error, stdout, stderr) => {
					stdoutListener.flush();
					stderrListener.flush();
					resolve(buildProcessResult(error, stdout, stderr, aborted));
				},
			);

			this.serveProcess = process;

			const abortListener = () => {
				aborted = true;
				process?.kill("SIGTERM");
			};

			if (resolvedOptions?.signal) {
				resolvedOptions.signal.addEventListener("abort", abortListener);
			}
		});

		const process = this.serveProcess;
		if (!process) {
			return {
				ok: false,
				error: "Failed to start quartz serve",
				process: null,
				result,
			};
		}

		stdoutListener = attachLineListeners(
			process.stdout,
			resolvedOptions?.onStdout,
		);
		stderrListener = attachLineListeners(
			process.stderr,
			resolvedOptions?.onStderr,
		);

		void result.finally(() => {
			if (this.serveProcess === process) {
				this.serveProcess = null;
			}
		});

		return { ok: true, process, result };
	}

	stopServe(): void {
		if (this.serveProcess) {
			this.serveProcess.kill("SIGTERM");
			this.serveProcess = null;
		}
	}

	get isServing(): boolean {
		return Boolean(this.serveProcess);
	}

	async sync(
		options?: QuartzSyncOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const args = ["quartz", "sync"];
		if (options?.commit === false) {
			args.push("--no-commit");
		}
		if (options?.push === false) {
			args.push("--no-push");
		}
		if (options?.pull === false) {
			args.push("--no-pull");
		}
		if (options?.message) {
			args.push("--message", options.message);
		}
		const result = await this.runner.run({
			binary: "npx",
			args,
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
			...(options?.signal ? { signal: options.signal } : {}),
			...(options?.onStdout ? { onStdout: options.onStdout } : {}),
			...(options?.onStderr ? { onStderr: options.onStderr } : {}),
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "quartz sync failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async restore(
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "restore"],
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
			...(options?.signal ? { signal: options.signal } : {}),
			...(options?.onStdout ? { onStdout: options.onStdout } : {}),
			...(options?.onStderr ? { onStderr: options.onStderr } : {}),
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "quartz restore failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginInstall(
		options?: QuartzPluginInstallOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const args = ["quartz", "plugin", "install"];
		if (options?.fromConfig) {
			args.push("--from-config");
		}
		if (options?.latest) {
			args.push("--latest");
		}
		if (options?.clean) {
			args.push("--clean");
		}
		if (options?.dryRun) {
			args.push("--dry-run");
		}
		const result = await this.runner.run({
			binary: "npx",
			args,
			cwd,
			timeout: options?.timeout ?? 120000,
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
					"quartz plugin install failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginEnable(
		names: string[],
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "plugin", "enable", ...names],
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
					"quartz plugin enable failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginDisable(
		names: string[],
		options?: QuartzRunnerOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "plugin", "disable", ...names],
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
					"quartz plugin disable failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginConfig(
		name: string,
		options?: QuartzPluginConfigOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const args = ["quartz", "plugin", "config", name];
		if (options?.set) {
			args.push("--set", options.set);
		}
		const result = await this.runner.run({
			binary: "npx",
			args,
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
					"quartz plugin config failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async pluginPrune(
		options?: QuartzPluginPruneOptions,
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const cwd = this.resolveCwd(options?.cwd);
		if (!cwd) {
			return { ok: false, error: "Quartz repo path not set" };
		}
		const args = ["quartz", "plugin", "prune"];
		if (options?.dryRun) {
			args.push("--dry-run");
		}
		const result = await this.runner.run({
			binary: "npx",
			args,
			cwd,
			...(options?.timeout !== undefined
				? { timeout: options.timeout }
				: {}),
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
					"quartz plugin prune failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}
}

function attachLineListeners(
	stream:
		| NonNullable<ProcessStartResult["process"]>["stdout"]
		| NonNullable<ProcessStartResult["process"]>["stderr"],
	onLine: ((line: string) => void) | undefined,
): { flush: () => void } {
	if (!stream || !onLine) {
		return { flush: () => {} };
	}

	const decoder = new TextDecoder();
	let buffer = "";
	stream.on("data", (chunk) => {
		buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
		const parts = buffer.split(/\r?\n/);
		buffer = parts.pop() ?? "";
		for (const part of parts) {
			onLine(part);
		}
	});

	return {
		flush: () => {
			if (buffer.length > 0) {
				onLine(buffer);
				buffer = "";
			}
		},
	};
}

function buildProcessResult(
	error: ExecFileError | null,
	stdout: string,
	stderr: string,
	killed: boolean,
): ProcessResult {
	const exitCode =
		error && typeof error.code === "number" ? error.code : error ? 1 : 0;
	const errorMessage = error?.message ?? stderr;

	return {
		stdout,
		stderr,
		exitCode,
		killed: killed || Boolean(error?.killed || error?.signal),
		...(error ? { error: errorMessage } : {}),
	};
}
