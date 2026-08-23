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

function cacheTagMatches(): boolean {
	const tagPath = join(QUARTZ_CACHE_DIR, TAG_MARKER_FILE);
	if (!existsSync(tagPath)) {
		return false;
	}
	const cachedTag = readFileSync(tagPath, "utf-8").trim();
	return cachedTag === QUARTZ_TAG;
}

function hasNormalizeHastElement(): boolean {
	const utilsTypesPath = join(
		QUARTZ_CACHE_DIR,
		"node_modules",
		"@quartz-community",
		"utils",
		"dist",
		"index.d.ts",
	);
	if (!existsSync(utilsTypesPath)) {
		return false;
	}
	return readFileSync(utilsTypesPath, "utf-8").includes(
		"normalizeHastElement",
	);
}

function ensureQuartzUtilsCompatibility(): void {
	if (hasNormalizeHastElement()) {
		return;
	}
	execSync("npm install @quartz-community/utils@latest", {
		cwd: QUARTZ_CACHE_DIR,
		stdio: "inherit",
	});
}

export function ensureQuartzCache(): void {
	if (existsSync(QUARTZ_CACHE_DIR) && cacheTagMatches()) {
		const engineDir = join(QUARTZ_CACHE_DIR, QUARTZ_ENGINE_DIR);
		if (!existsSync(engineDir)) {
			cpSync(join(QUARTZ_CACHE_DIR, QUARTZ_SOURCE_DIR), engineDir, {
				recursive: true,
			});
		}
		ensureQuartzUtilsCompatibility();
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
	execSync("npm install", { cwd: QUARTZ_CACHE_DIR, stdio: "inherit" });
	cpSync(
		join(QUARTZ_CACHE_DIR, QUARTZ_SOURCE_DIR),
		join(QUARTZ_CACHE_DIR, QUARTZ_ENGINE_DIR),
		{
			recursive: true,
		},
	);
	ensureQuartzUtilsCompatibility();
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
