import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	cpSync,
	mkdtempSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { QUARTZ_CACHE_DIR, QUARTZ_REPO, QUARTZ_TAG } from "./quartz-config";

const TAG_MARKER_FILE = ".quartz-tag";
const QUARTZ_ENGINE_DIR = ".quartz";
const QUARTZ_SOURCE_DIR = "quartz";

function approveInstallScripts(): void {
	const pkgPath = join(QUARTZ_CACHE_DIR, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	pkg.allowScripts = pkg.allowScripts ?? {};
	pkg.allowScripts["esbuild"] = true;
	pkg.allowScripts["sharp"] = true;
	pkg.allowScripts["@parcel/watcher"] = true;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

function cacheTagMatches(): boolean {
	const tagPath = join(QUARTZ_CACHE_DIR, TAG_MARKER_FILE);
	if (!existsSync(tagPath)) {
		return false;
	}
	const cachedTag = readFileSync(tagPath, "utf-8").trim();
	return cachedTag === QUARTZ_TAG;
}

export function ensureQuartzCache(): void {
	if (existsSync(QUARTZ_CACHE_DIR) && cacheTagMatches()) {
		const engineDir = join(QUARTZ_CACHE_DIR, QUARTZ_ENGINE_DIR);
		if (!existsSync(engineDir)) {
			cpSync(join(QUARTZ_CACHE_DIR, QUARTZ_SOURCE_DIR), engineDir, {
				recursive: true,
			});
		}
		return;
	}

	if (existsSync(QUARTZ_CACHE_DIR)) {
		rmSync(QUARTZ_CACHE_DIR, { recursive: true, force: true });
	}

	mkdirSync(dirname(QUARTZ_CACHE_DIR), { recursive: true });
	execSync(
		`git clone --branch ${QUARTZ_TAG} --depth 1 ${QUARTZ_REPO} ${QUARTZ_CACHE_DIR}`,
		{ stdio: "inherit" },
	);
	approveInstallScripts();
	execSync("npm install", { cwd: QUARTZ_CACHE_DIR, stdio: "inherit" });
	cpSync(
		join(QUARTZ_CACHE_DIR, QUARTZ_SOURCE_DIR),
		join(QUARTZ_CACHE_DIR, QUARTZ_ENGINE_DIR),
		{
			recursive: true,
		},
	);
	writeFileSync(join(QUARTZ_CACHE_DIR, TAG_MARKER_FILE), QUARTZ_TAG, "utf-8");
}

export function createTestQuartzDir(): string {
	const tempDir = mkdtempSync(join(tmpdir(), "quartz-build-"));
	cpSync(QUARTZ_CACHE_DIR, tempDir, { recursive: true });
	return tempDir;
}

export function cleanupTestDir(path: string): void {
	if (!path) {
		return;
	}
	rmSync(path, { recursive: true, force: true });
}
