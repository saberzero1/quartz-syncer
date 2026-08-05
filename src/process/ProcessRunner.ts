import { Platform } from "obsidian";
import { getModule } from "src/utils/external-fs";
import {
	ALLOWED_BINARIES,
	type ProcessConfig,
	type ProcessResult,
} from "./types";

type ExecFileError = {
	code?: string | number;
	signal?: string | null;
	message?: string;
	killed?: boolean;
};

type ExecFileOptions = {
	timeout?: number;
	killSignal?: string | number;
	cwd?: string;
};

export type ChildProcessHandle = {
	kill(signal?: string | number): void;
	stdout?: {
		on: (
			event: "data",
			listener: (chunk: Uint8Array | string) => void,
		) => void;
	};
	stderr?: {
		on: (
			event: "data",
			listener: (chunk: Uint8Array | string) => void,
		) => void;
	};
};

type ChildProcessModule = {
	execFile(
		file: string,
		args: readonly string[],
		options: ExecFileOptions,
		callback: (
			error: ExecFileError | null,
			stdout: string,
			stderr: string,
		) => void,
	): ChildProcessHandle;
};

export type ProcessStartResult = {
	process: ChildProcessHandle | null;
	result: Promise<ProcessResult>;
};

let childProcessCache: ChildProcessModule | null = null;
let pendingProcess: ChildProcessHandle | null = null;
let disabled = false;
let errorTimestamps: number[] = [];
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

const ERROR_WINDOW_MS = 60_000;
const ERROR_THRESHOLD = 3;
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

function getChildProcess(): ChildProcessModule {
	if (!childProcessCache) {
		childProcessCache = getModule<ChildProcessModule>("child_process");
	}
	return childProcessCache;
}

function recordError(message: string, error?: ExecFileError): void {
	const now = Date.now();
	errorTimestamps = errorTimestamps.filter((t) => now - t <= ERROR_WINDOW_MS);
	errorTimestamps.push(now);

	if (error) {
		console.warn(`Process error: ${message}`, error);
	} else {
		console.warn(`Process error: ${message}`);
	}

	if (errorTimestamps.length >= ERROR_THRESHOLD && !disabled) {
		disabled = true;
		console.warn("Process execution disabled after repeated errors");
		scheduleRecovery();
	}
}

function scheduleRecovery(): void {
	if (recoveryTimer !== null) return;

	recoveryTimer = setTimeout(() => {
		disabled = false;
		errorTimestamps = [];
		recoveryTimer = null;
		console.debug("Process circuit breaker auto-recovered");
	}, RECOVERY_COOLDOWN_MS);
}

function recordSuccess(): void {
	errorTimestamps = [];
	disabled = false;
}

function isFatalExecError(error: ExecFileError): boolean {
	return error.code === "ENOENT" || Boolean(error.signal);
}

function terminatePendingProcess(): void {
	if (pendingProcess) {
		pendingProcess.kill("SIGTERM");
		pendingProcess = null;
	}
}

function createErrorResult(
	stderrMessage: string,
	errorMessage = stderrMessage,
	killed = false,
): ProcessResult {
	return {
		stdout: "",
		stderr: stderrMessage,
		exitCode: 1,
		killed,
		error: errorMessage,
	};
}

function attachLineListeners(
	stream: ChildProcessHandle["stdout"] | ChildProcessHandle["stderr"],
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

export class ProcessRunner {
	static resetChildProcessCache(): void {
		childProcessCache = null;
		pendingProcess = null;
	}

	async run(config: ProcessConfig): Promise<ProcessResult> {
		if (!Platform.isDesktopApp) {
			return createErrorResult("Not available on mobile", "Desktop only");
		}
		if (disabled) {
			return createErrorResult(
				"Process execution disabled after repeated errors",
				"Circuit breaker active",
			);
		}
		if (!ALLOWED_BINARIES.includes(config.binary)) {
			return createErrorResult(
				`Binary '${config.binary}' not in allowlist`,
				"Not allowed",
			);
		}
		if (config.signal?.aborted) {
			return createErrorResult("Aborted", "Aborted", true);
		}

		const timeout =
			config.timeout === -1
				? 0
				: config.timeout && config.timeout > 0
					? config.timeout
					: 30000;

		terminatePendingProcess();

		return await new Promise((resolve) => {
			let childProcess: ChildProcessModule;
			let aborted = false;

			try {
				childProcess = getChildProcess();
			} catch (error) {
				recordError("Failed to load child_process", {
					message: (error as Error).message,
				});
				resolve(createErrorResult("Failed to load child_process"));
				return;
			}

			const abortListener = () => {
				aborted = true;
				if (pendingProcess) {
					pendingProcess.kill("SIGTERM");
				}
			};

			if (config.signal) {
				config.signal.addEventListener("abort", abortListener);
			}

			try {
				pendingProcess = childProcess.execFile(
					config.binary,
					config.args,
					{ timeout, killSignal: "SIGTERM", cwd: config.cwd },
					(error, stdout, stderr) => {
						pendingProcess = null;
						if (config.signal) {
							config.signal.removeEventListener(
								"abort",
								abortListener,
							);
						}

						const killed =
							Boolean(error?.signal) ||
							Boolean(error?.killed) ||
							aborted;
						const exitCode =
							typeof error?.code === "number"
								? error.code
								: error
									? 1
									: 0;
						const result: ProcessResult = {
							stdout,
							stderr,
							exitCode,
							killed,
							error: error?.message,
						};

						if (error && isFatalExecError(error)) {
							recordError("execFile failed", error);
							resolve(result);
							return;
						}

						recordSuccess();
						resolve(result);
					},
				);

				const stdoutListener = attachLineListeners(
					pendingProcess.stdout,
					config.onStdout,
				);
				const stderrListener = attachLineListeners(
					pendingProcess.stderr,
					config.onStderr,
				);

				const originalResolve = resolve;
				resolve = (result) => {
					stdoutListener.flush();
					stderrListener.flush();
					originalResolve(result);
				};
			} catch (error) {
				pendingProcess = null;
				if (config.signal) {
					config.signal.removeEventListener("abort", abortListener);
				}
				recordError("execFile threw", {
					message: (error as Error).message,
				});
				resolve(createErrorResult("execFile threw"));
			}
		});
	}

	start(config: ProcessConfig): ProcessStartResult {
		if (!Platform.isDesktopApp) {
			return {
				process: null,
				result: Promise.resolve(
					createErrorResult(
						"Not available on mobile",
						"Desktop only",
					),
				),
			};
		}
		if (disabled) {
			return {
				process: null,
				result: Promise.resolve(
					createErrorResult(
						"Process execution disabled after repeated errors",
						"Circuit breaker active",
					),
				),
			};
		}
		if (!ALLOWED_BINARIES.includes(config.binary)) {
			return {
				process: null,
				result: Promise.resolve(
					createErrorResult(
						`Binary '${config.binary}' not in allowlist`,
						"Not allowed",
					),
				),
			};
		}

		const timeout =
			config.timeout === -1
				? 0
				: config.timeout && config.timeout > 0
					? config.timeout
					: 30000;
		terminatePendingProcess();

		const result = new Promise<ProcessResult>((resolve) => {
			let childProcess: ChildProcessModule;
			let aborted = false;

			try {
				childProcess = getChildProcess();
			} catch (error) {
				recordError("Failed to load child_process", {
					message: (error as Error).message,
				});
				resolve(createErrorResult("Failed to load child_process"));
				return;
			}

			const abortListener = () => {
				aborted = true;
				if (pendingProcess) {
					pendingProcess.kill("SIGTERM");
				}
			};

			if (config.signal) {
				config.signal.addEventListener("abort", abortListener);
			}

			try {
				pendingProcess = childProcess.execFile(
					config.binary,
					config.args,
					{ timeout, killSignal: "SIGTERM", cwd: config.cwd },
					(error, stdout, stderr) => {
						pendingProcess = null;
						if (config.signal) {
							config.signal.removeEventListener(
								"abort",
								abortListener,
							);
						}

						const killed =
							Boolean(error?.signal) ||
							Boolean(error?.killed) ||
							aborted;
						const exitCode =
							typeof error?.code === "number"
								? error.code
								: error
									? 1
									: 0;
						const result: ProcessResult = {
							stdout,
							stderr,
							exitCode,
							killed,
							error: error?.message,
						};

						if (error && isFatalExecError(error)) {
							recordError("execFile failed", error);
							resolve(result);
							return;
						}

						recordSuccess();
						resolve(result);
					},
				);

				const stdoutListener = attachLineListeners(
					pendingProcess.stdout,
					config.onStdout,
				);
				const stderrListener = attachLineListeners(
					pendingProcess.stderr,
					config.onStderr,
				);

				const originalResolve = resolve;
				resolve = (result) => {
					stdoutListener.flush();
					stderrListener.flush();
					originalResolve(result);
				};
			} catch (error) {
				pendingProcess = null;
				if (config.signal) {
					config.signal.removeEventListener("abort", abortListener);
				}
				recordError("execFile threw", {
					message: (error as Error).message,
				});
				resolve(createErrorResult("execFile threw"));
			}
		});

		return { process: pendingProcess, result };
	}

	get isDisabled(): boolean {
		return disabled;
	}

	resetCircuitBreaker(): void {
		disabled = false;
		errorTimestamps = [];
		if (recoveryTimer !== null) {
			clearTimeout(recoveryTimer);
			recoveryTimer = null;
		}
	}
}
