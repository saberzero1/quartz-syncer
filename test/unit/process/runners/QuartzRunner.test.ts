import { Platform } from "obsidian";
import { QuartzRunner } from "src/process/runners/QuartzRunner";
import type { ProcessRunner } from "src/process/ProcessRunner";
import type { ProcessResult } from "src/process/types";

const successResult: ProcessResult = {
	stdout: "",
	stderr: "",
	exitCode: 0,
	killed: false,
};

describe("QuartzRunner", () => {
	beforeEach(() => {
		Platform.isDesktopApp = true;
	});

	it("update calls npx quartz update", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.update();

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "update"],
			cwd: "/repo",
		});
	});

	it("pluginAdd calls correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginAdd("github:org/plugin");

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "add", "github:org/plugin"],
			cwd: "/repo",
		});
	});

	it("serve calls npx quartz build --serve --port", () => {
		const start = vi.fn().mockReturnValue({
			process: { kill: vi.fn() },
			result: Promise.resolve(successResult),
		});
		const runner = new QuartzRunner(
			{ start } as unknown as ProcessRunner,
			"/repo",
		);
		runner.serve(8080);

		expect(start).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "build", "--serve", "--port", "8080"],
			cwd: "/repo",
		});
	});
});
