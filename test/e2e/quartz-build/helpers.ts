import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeNoteToQuartz(
	quartzDir: string,
	relativePath: string,
	content: string,
): void {
	const notePath = join(quartzDir, "content", relativePath);
	mkdirSync(dirname(notePath), { recursive: true });
	writeFileSync(notePath, content, "utf-8");
}

export function writeAssetToQuartz(
	quartzDir: string,
	relativePath: string,
	data: Uint8Array,
): void {
	const assetPath = join(quartzDir, "content", relativePath);
	mkdirSync(dirname(assetPath), { recursive: true });
	writeFileSync(assetPath, data);
}

export async function runQuartzBuild(
	quartzDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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

export function outputExists(quartzDir: string): boolean {
	const outputPath = join(quartzDir, "public");
	if (!existsSync(outputPath)) {
		return false;
	}
	return statSync(outputPath).isDirectory();
}

export function indexHtmlExists(quartzDir: string): boolean {
	const indexPath = join(quartzDir, "public", "index.html");
	if (!existsSync(indexPath)) {
		return false;
	}
	return statSync(indexPath).isFile();
}
