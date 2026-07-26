import { Platform } from "obsidian";
import type { ProcessResult } from "../types";
import type { ProcessRunner } from "../ProcessRunner";

export type NpmRunnerResult<T> =
	| { ok: true; data: T; processResult: ProcessResult }
	| { ok: false; error: string; processResult?: ProcessResult };

export class NpmRunner {
	private runner: ProcessRunner;
	private cwd: string;

	constructor(runner: ProcessRunner, cwd: string) {
		this.runner = runner;
		this.cwd = cwd;
	}

	async version(): Promise<NpmRunnerResult<{ version: string | null }>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npm",
			args: ["--version"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "Failed to get npm version",
				processResult: result,
			};
		}
		return {
			ok: true,
			data: { version: result.stdout.trim() || null },
			processResult: result,
		};
	}

	async install(): Promise<NpmRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const result = await this.runner.run({
			binary: "npm",
			args: ["install"],
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "npm install failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}

	async update(pkg?: string): Promise<NpmRunnerResult<Record<string, never>>> {
		if (!Platform.isDesktopApp) {
			return { ok: false, error: "Desktop only" };
		}
		const args = pkg ? ["update", pkg] : ["update"];
		const result = await this.runner.run({
			binary: "npm",
			args,
			cwd: this.cwd,
		});
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: result.error ?? result.stderr ?? "npm update failed",
				processResult: result,
			};
		}
		return { ok: true, data: {}, processResult: result };
	}
}
