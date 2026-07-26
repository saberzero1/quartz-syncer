import { Platform } from "obsidian";
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
		(
			window as Window & { require?: (module: string) => unknown }
		).require = vi.fn((module: string) => {
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
		Platform.isDesktopApp = true;
		vi.clearAllMocks();
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
			callback({ code: 1, signal: "SIGTERM", message: "timeout" }, "", "");
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
			callback(
				{ code: "ENOENT", message: "not found" },
				"",
				"",
			);
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
		expect(result.error).toBeDefined();
	});

	it("returns error on mobile", async () => {
		Platform.isDesktopApp = false;
		const result = await runner.run({
			binary: "git",
			args: ["status"],
			cwd: ".",
		});

		expect(result.exitCode).toBe(1);
		expect(result.error).toBeDefined();
	});
});
