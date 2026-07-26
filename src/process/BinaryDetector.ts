import type { AllowedBinary, BinaryInfo } from "./types";
import { ALLOWED_BINARIES } from "./types";
import type { ProcessRunner } from "./ProcessRunner";

export class BinaryDetector {
	private cache = new Map<AllowedBinary, string | null>();
	private runner: ProcessRunner;

	constructor(runner: ProcessRunner) {
		this.runner = runner;
	}

	async detect(binary: AllowedBinary): Promise<string | null> {
		if (this.cache.has(binary)) return this.cache.get(binary)!;
		const result = await this.runner.run({
			binary,
			args: ["--version"],
			cwd: ".",
			timeout: 5000,
		});
		const path = result.exitCode === 0 ? binary : null;
		this.cache.set(binary, path);
		return path;
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
		return Promise.all(
			ALLOWED_BINARIES.map(async (name) => {
				const path = await this.detect(name);
				const version = path ? await this.getVersion(name) : null;
				return { name, path, version, available: path !== null };
			}),
		);
	}

	clearCache(): void {
		this.cache.clear();
	}
}
