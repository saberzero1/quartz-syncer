import { spawnSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";

export interface QuartzBuildResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export function runQuartzBuild(quartzDir: string): QuartzBuildResult {
	const result = spawnSync("npx", ["quartz", "build"], {
		cwd: quartzDir,
		encoding: "utf-8",
		timeout: 60_000,
	});
	return {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? (result.error ? String(result.error) : ""),
	};
}

export function buildOutputExists(quartzDir: string): boolean {
	const outputPath = join(quartzDir, "public");
	return existsSync(outputPath) && statSync(outputPath).isDirectory();
}

export function buildIndexExists(quartzDir: string): boolean {
	const indexPath = join(quartzDir, "public", "index.html");
	return existsSync(indexPath) && statSync(indexPath).isFile();
}
