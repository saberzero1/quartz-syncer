import { Platform } from "obsidian";
import { NpmRunner } from "src/process/runners/NpmRunner";
import type { ProcessRunner } from "src/process/ProcessRunner";
import type { ProcessResult } from "src/process/types";

const successResult: ProcessResult = {
	stdout: "",
	stderr: "",
	exitCode: 0,
	killed: false,
};

describe("NpmRunner", () => {
	beforeEach(() => {
		Platform.isDesktopApp = true;
	});

	it("parses npm version", async () => {
		const run = vi.fn().mockResolvedValue({
			...successResult,
			stdout: "10.2.0\n",
		});
		const runner = new NpmRunner({ run } as unknown as ProcessRunner, "/repo");

		const result = await runner.version();

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.version).toBe("10.2.0");
		}
	});

	it("update passes correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new NpmRunner({ run } as unknown as ProcessRunner, "/repo");
		await runner.update("obsidian");

		expect(run).toHaveBeenCalledWith({
			binary: "npm",
			args: ["update", "obsidian"],
			cwd: "/repo",
		});
	});
});
