import { Platform } from "obsidian";
import { getModule } from "src/utils/external-fs";
import type { AllowedBinary, BinaryInfo } from "./types";
import { ALLOWED_BINARIES } from "./types";
import type { ProcessRunner } from "./ProcessRunner";

type ShellExecModule = {
	execFile(
		file: string,
		args: readonly string[],
		options: { timeout?: number; shell?: boolean },
		callback: (
			error: { message?: string } | null,
			stdout: string,
			stderr: string,
		) => void,
	): void;
};

function resolveAbsolutePath(binary: string): Promise<string | null> {
	if (!Platform.isDesktopApp) return Promise.resolve(null);

	const cp = getModule<ShellExecModule>("child_process");
	const command = Platform.isWin ? "where" : "which";

	return new Promise((resolve) => {
		cp.execFile(
			command,
			[binary],
			{ timeout: 5000, shell: true },
			(error, stdout) => {
				if (error || !stdout.trim()) {
					resolve(null);
					return;
				}
				resolve(stdout.trim().split(/\r?\n/)[0] ?? null);
			},
		);
	});
}

export class BinaryDetector {
	private cache = new Map<AllowedBinary, string | null>();
	private runner: ProcessRunner;

	constructor(runner: ProcessRunner) {
		this.runner = runner;
	}

	async detect(binary: AllowedBinary): Promise<string | null> {
		if (this.cache.has(binary)) return this.cache.get(binary)!;

		const absolutePath = await resolveAbsolutePath(binary);
		if (!absolutePath) {
			this.cache.set(binary, null);
			return null;
		}

		// Cache the path immediately so the runner can resolve it
		// during the --version verification call below.
		this.cache.set(binary, absolutePath);

		const result = await this.runner.run({
			binary,
			args: ["--version"],
			cwd: ".",
			timeout: 5000,
		});

		if (result.exitCode !== 0) {
			this.cache.set(binary, null);
			return null;
		}

		return absolutePath;
	}

	async getVersion(binary: AllowedBinary): Promise<string | null> {
		const result = await this.runner.run({
			binary,
			args: ["--version"],
			cwd: ".",
			timeout: 5000,
		});
		if (result.exitCode !== 0) return null;
		return result.stdout.trim().split("\n")[0] ?? null;
	}

	async detectAll(): Promise<BinaryInfo[]> {
		const results: BinaryInfo[] = [];

		for (const name of ALLOWED_BINARIES) {
			const path = await this.detect(name);
			const version = path ? await this.getVersion(name) : null;
			results.push({ name, path, version, available: path !== null });
		}

		return results;
	}

	getResolvedPath(binary: AllowedBinary): string | null | undefined {
		return this.cache.get(binary);
	}

	clearCache(): void {
		this.cache.clear();
	}
}
