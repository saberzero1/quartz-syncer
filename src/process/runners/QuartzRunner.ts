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

export class QuartzRunner {
	private runner: ProcessRunner;
	private cwd: string;

	constructor(runner: ProcessRunner, cwd: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	async update(): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "update"],
			cwd: this.cwd,
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
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "plugin", "add", source],
			cwd: this.cwd,
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
	): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "plugin", "remove", name],
			cwd: this.cwd,
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

	async build(): Promise<QuartzRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npx",
			args: ["quartz", "build"],
			cwd: this.cwd,
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

	serve(port?: number): QuartzServeResult {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only", process: null };
		}
		const args = port
			? ["quartz", "build", "--serve", "--port", String(port)]
			: ["quartz", "build", "--serve"];
		const start = this.runner.start({
			binary: "npx",
			args,
			cwd: this.cwd,
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
