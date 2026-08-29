import { Platform } from "obsidian";
import { GitRunner } from "src/process/runners/GitRunner";
import type { ProcessRunner } from "src/process/ProcessRunner";
import type { ProcessResult } from "src/process/types";

const successResult: ProcessResult = {
	stdout: "",
	stderr: "",
	exitCode: 0,
	killed: false,
};

describe("GitRunner", () => {
	beforeEach(() => {
		Platform.isDesktopApp = true;
	});

	it("parses git version", async () => {
		const run = vi.fn().mockResolvedValue({
			...successResult,
			stdout: "git version 2.44.0\n",
		});
		const runner = new GitRunner(
			{ run } as unknown as ProcessRunner,
			"/tmp",
		);

		const result = await runner.version();

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.version).toBe("2.44.0");
		}
	});

	it("clone passes correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new GitRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.clone("https://example.com/repo.git", "dest");

		expect(run).toHaveBeenCalledWith({
			binary: "git",
			args: ["clone", "https://example.com/repo.git", "dest"],
			cwd: "/repo",
			timeout: -1,
		});
	});

	it("pull passes correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new GitRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pull();

		expect(run).toHaveBeenCalledWith({
			binary: "git",
			args: ["pull"],
			cwd: "/repo",
		});
	});
});
