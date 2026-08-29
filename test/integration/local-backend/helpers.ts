import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempRepo(): Promise<string> {
	return mkdtemp(join(tmpdir(), "quartz-syncer-test-"));
}

export async function cleanupTempRepo(path: string): Promise<void> {
	await rm(path, { recursive: true, force: true });
}
