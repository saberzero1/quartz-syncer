import { Platform } from "obsidian";
import { QuartzRunner } from "src/process/runners/QuartzRunner";
import type { ProcessRunner } from "src/process/ProcessRunner";
import type { ProcessResult } from "src/process/types";

const { getModule, setChildProcess } = vi.hoisted(() => {
	let childProcess: { execFile: ReturnType<typeof vi.fn> } | null = null;
	return {
		getModule: vi.fn(() => {
			if (!childProcess) {
				throw new Error("Missing child_process");
			}
			return childProcess;
		}),
		setChildProcess: (nextChildProcess: {
			execFile: ReturnType<typeof vi.fn>;
		}) => {
			childProcess = nextChildProcess;
		},
	};
});

vi.mock("src/utils/external-fs", () => ({
	getModule,
}));

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
		const execFile = vi.fn(() => ({
			kill: vi.fn(),
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
		}));
		setChildProcess({ execFile });
		const runner = new QuartzRunner(
			{ run: vi.fn() } as unknown as ProcessRunner,
			"/repo",
		);
		runner.serve(8080);

		expect(execFile).toHaveBeenCalledWith(
			"npx",
			["quartz", "build", "--serve", "--port", "8080"],
			{ cwd: "/repo", timeout: undefined },
			expect.any(Function),
		);
	});

	it("sync passes through flags and message", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.sync({
			commit: false,
			push: false,
			pull: false,
			message: "Sync notes",
		});

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: [
				"quartz",
				"sync",
				"--no-commit",
				"--no-push",
				"--no-pull",
				"--message",
				"Sync notes",
			],
			cwd: "/repo",
		});
	});

	it("restore runs npx quartz restore", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.restore();

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "restore"],
			cwd: "/repo",
		});
	});

	it("pluginInstall uses timeout and flags", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginInstall({
			fromConfig: true,
			latest: true,
			clean: true,
			dryRun: true,
		});

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: [
				"quartz",
				"plugin",
				"install",
				"--from-config",
				"--latest",
				"--clean",
				"--dry-run",
			],
			cwd: "/repo",
			timeout: 120000,
		});
	});

	it("pluginRemove calls correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginRemove("graph");

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "remove", "graph"],
			cwd: "/repo",
		});
	});

	it("pluginEnable calls correct args with multiple names", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginEnable(["graph", "explorer"]);

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "enable", "graph", "explorer"],
			cwd: "/repo",
		});
	});

	it("pluginDisable calls correct args with multiple names", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginDisable(["graph", "explorer"]);

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "disable", "graph", "explorer"],
			cwd: "/repo",
		});
	});

	it("pluginConfig calls correct args with --set", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginConfig("graph", { set: "a=b" });

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "config", "graph", "--set", "a=b"],
			cwd: "/repo",
		});
	});

	it("pluginPrune calls correct args with --dry-run", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.pluginPrune({ dryRun: true });

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "plugin", "prune", "--dry-run"],
			cwd: "/repo",
		});
	});

	it("build calls correct args", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const runner = new QuartzRunner(
			{ run } as unknown as ProcessRunner,
			"/repo",
		);
		await runner.build();

		expect(run).toHaveBeenCalledWith({
			binary: "npx",
			args: ["quartz", "build"],
			cwd: "/repo",
		});
	});

	it("returns error when desktop-only method called on mobile", async () => {
		Platform.isDesktopApp = false;
		const runner = new QuartzRunner(
			{ run: vi.fn() } as unknown as ProcessRunner,
			"/repo",
		);

		const result = await runner.build();

		expect(result).toEqual({ ok: false, error: "Desktop only" });
	});

	it("returns error when cwd is not set", async () => {
		const runner = new QuartzRunner({ run: vi.fn() } as ProcessRunner);

		const result = await runner.pluginRemove("graph");

		expect(result).toEqual({
			ok: false,
			error: "Quartz repo path not set",
		});
	});
});
