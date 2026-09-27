import { Platform, resetPlatform } from "obsidian";
import { ProcessRunner } from "src/process/ProcessRunner";
import type { AllowedBinary, ProcessResult } from "src/process/types";

type ExecFileError = {
	code?: string | number;
	signal?: string | null;
	message?: string;
	killed?: boolean;
};

type ExecFileCallback = (
	error: ExecFileError | null,
	stdout: string,
	stderr: string,
) => void;

type ExecFileMock = (
	file: string,
	args: readonly string[],
	options: { timeout?: number; killSignal?: string | number; cwd?: string },
	callback: ExecFileCallback,
) => { kill: (signal?: string | number) => void };

describe("ProcessRunner", () => {
	let execFileMock: ReturnType<typeof vi.fn<ExecFileMock>>;
	let runner: ProcessRunner;

	beforeEach(() => {
		execFileMock = vi.fn();
		(window as Window & { require?: (module: string) => unknown }).require =
			vi.fn((module: string) => {
				if (module === "child_process") {
					return { execFile: execFileMock };
				}
				throw new Error("Unknown module");
			});
		Platform.isDesktopApp = true;
		ProcessRunner.resetChildProcessCache();
		runner = new ProcessRunner();
		runner.resetCircuitBreaker();
	});

	afterEach(() => {
		resetPlatform();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("runs without a shell on Linux", async () => {
		Platform.isWin = false;
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(null, "ok", "");
			return { kill: vi.fn() };
		});

		await runner.run({
			binary: "npx",
			args: ["quartz", "build"],
			cwd: ".",
		});

		expect(execFileMock).toHaveBeenCalledWith(
			"npx",
			["quartz", "build"],
			{
				timeout: 30000,
				killSignal: "SIGTERM",
				cwd: ".",
				shell: false,
				windowsHide: true,
			},
			expect.any(Function),
		);
	});

	it("rejects newlines before spawning on Linux", async () => {
		Platform.isWin = false;
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(null, "ok", "");
			return { kill: vi.fn() };
		});

		const result = await runner.run({
			binary: "npx",
			args: ["quartz", "sync", "--message", "first\nsecond"],
			cwd: ".",
		});

		expect(execFileMock).not.toHaveBeenCalled();
		expect(result.exitCode).toBe(1);
	});

	it("passes commit message metacharacters unchanged on Linux", async () => {
		Platform.isWin = false;
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(null, "ok", "");
			return { kill: vi.fn() };
		});
		const args = [
			"quartz",
			"sync",
			"--message",
			"fix: don't break (again)",
		];

		const result = await runner.run({ binary: "npx", args, cwd: "." });

		expect(execFileMock).toHaveBeenCalledWith(
			"npx",
			args,
			expect.objectContaining({ shell: false }),
			expect.any(Function),
		);
		expect(result.exitCode).toBe(0);
	});

	it("rejects commit message metacharacters for npx on Windows", async () => {
		Platform.isWin = true;
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(null, "ok", "");
			return { kill: vi.fn() };
		});

		const result = await runner.run({
			binary: "npx",
			args: ["quartz", "sync", "--message", "fix: don't break (again)"],
			cwd: ".",
		});

		expect(execFileMock).not.toHaveBeenCalled();
		expect(result.exitCode).toBe(1);
	});

	it("returns stdout/stderr on success", async () => {
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(null, "ok\n", "");
			return { kill: vi.fn() };
		});

		const result = await runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
		});

		expect(result).toEqual<ProcessResult>({
			stdout: "ok\n",
			stderr: "",
			exitCode: 0,
			killed: false,
			error: undefined,
		});
	});

	it("marks killed on timeout", async () => {
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback(
				{ code: 1, signal: "SIGTERM", message: "timeout" },
				"",
				"",
			);
			return { kill: vi.fn() };
		});

		const result = await runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
			timeout: 1,
		});

		expect(result.killed).toBe(true);
		expect(result.exitCode).toBe(1);
	});

	it("returns error on ENOENT", async () => {
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback({ code: "ENOENT", message: "not found" }, "", "");
			return { kill: vi.fn() };
		});

		const result = await runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
		});

		expect(result.exitCode).toBe(1);
		expect(result.error).toBe("not found");
	});

	it("kills process on AbortSignal", async () => {
		let capturedCallback: ExecFileCallback = () => {};
		const handle = { kill: vi.fn() };
		execFileMock.mockImplementation((_, __, ___, callback) => {
			capturedCallback = callback;
			return handle;
		});

		const controller = new AbortController();
		const promise = runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
			signal: controller.signal,
		});

		controller.abort();
		expect(handle.kill).toHaveBeenCalledWith("SIGTERM");
		capturedCallback(
			{ code: 1, signal: "SIGTERM", message: "aborted", killed: true },
			"",
			"",
		);

		const result = await promise;
		expect(result.killed).toBe(true);
	});

	it("kills a pending process on shutdown", async () => {
		let capturedCallback: ExecFileCallback = () => {};
		const handle = { kill: vi.fn() };
		execFileMock.mockImplementation((_, __, ___, callback) => {
			capturedCallback = callback;
			return handle;
		});
		const promise = runner.run({
			binary: "npx",
			args: ["quartz", "build"],
			cwd: ".",
			timeout: -1,
		});

		ProcessRunner.shutdown();

		expect(handle.kill).toHaveBeenCalledWith("SIGTERM");
		capturedCallback(
			{ code: 1, signal: "SIGTERM", message: "shutdown", killed: true },
			"",
			"",
		);
		expect((await promise).killed).toBe(true);
	});

	it("disables after repeated errors", async () => {
		execFileMock.mockImplementation((_, __, ___, callback) => {
			callback({ code: "ENOENT", message: "nope" }, "", "");
			return { kill: vi.fn() };
		});

		await runner.run({ binary: "git", args: ["status"], cwd: "." });
		await runner.run({ binary: "git", args: ["status"], cwd: "." });
		await runner.run({ binary: "git", args: ["status"], cwd: "." });

		expect(runner.isDisabled).toBe(true);
	});

	it("resets circuit breaker on success", async () => {
		let call = 0;
		execFileMock.mockImplementation((_, __, ___, callback) => {
			call += 1;
			if (call === 1) {
				callback({ code: "ENOENT", message: "nope" }, "", "");
				return { kill: vi.fn() };
			}
			callback(null, "ok", "");
			return { kill: vi.fn() };
		});

		await runner.run({ binary: "git", args: ["status"], cwd: "." });
		await runner.run({ binary: "git", args: ["status"], cwd: "." });

		expect(runner.isDisabled).toBe(false);
	});

	it("rejects non-allowlisted binaries", async () => {
		const result = await runner.run({
			binary: "bash" as unknown as AllowedBinary,
			args: ["-c", "echo hi"],
			cwd: ".",
		});

		expect(result.exitCode).toBe(1);
		expect(result.error).toBe("Not allowed");
	});

	it("returns error on mobile", async () => {
		Platform.isDesktopApp = false;
		const result = await runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
		});

		expect(result.exitCode).toBe(1);
		expect(result.error).toBe("Desktop only");
	});
});
