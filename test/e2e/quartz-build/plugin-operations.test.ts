import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
	cleanupTestDir,
	createTestQuartzDir,
	ensureQuartzCache,
} from "./quartz-setup";
import { outputExists, runQuartzBuild, writeNoteToQuartz } from "./helpers";

function runQuartzPlugin(
	quartzDir: string,
	subcommand: string,
	args: string[] = [],
): { exitCode: number; stdout: string; stderr: string } {
	const result = spawnSync("npx", ["quartz", "plugin", subcommand, ...args], {
		cwd: quartzDir,
		encoding: "utf-8",
		timeout: 120_000,
	});
	return {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? (result.error ? String(result.error) : ""),
	};
}

function resetContentDir(baseDir: string): void {
	const contentDir = join(baseDir, "content");
	rmSync(contentDir, { recursive: true, force: true });
	mkdirSync(contentDir, { recursive: true });
}

function readUserQuartzConfig(quartzDir: string): string | null {
	const userConfigPath = join(quartzDir, "quartz.config.yaml");
	if (!existsSync(userConfigPath)) {
		return null;
	}
	return readFileSync(userConfigPath, "utf-8");
}

let quartzDir = "";

beforeAll(() => {
	ensureQuartzCache();
}, 120_000);

beforeEach(() => {
	quartzDir = createTestQuartzDir();
	resetContentDir(quartzDir);
});

afterEach(() => {
	if (quartzDir) {
		cleanupTestDir(quartzDir);
		quartzDir = "";
	}
});

describe("Quartz plugin operations", () => {
	it("Baseline build succeeds", async () => {
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Home\npublish: true\n---\nBaseline",
		);
		const result = await runQuartzBuild(quartzDir);
		expect(result.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
	}, 120_000);

	it("Add plugin from github source", async () => {
		const addResult = runQuartzPlugin(quartzDir, "add", [
			"github:quartz-community/explorer",
		]);
		expect(addResult.exitCode).toBe(0);
		const pluginPath = join(quartzDir, ".quartz", "plugins", "explorer");
		expect(existsSync(pluginPath)).toBe(true);
		const userConfig = readUserQuartzConfig(quartzDir);
		if (userConfig) {
			expect(userConfig).toContain("explorer");
		} else {
			console.info(
				"No quartz.config.yaml found after plugin add; default config remains in use.",
			);
		}
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Plugin Add\npublish: true\n---\nAdded plugin",
		);
		const buildResult = await runQuartzBuild(quartzDir);
		expect(buildResult.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
	}, 120_000);

	it("Remove plugin", async () => {
		const addResult = runQuartzPlugin(quartzDir, "add", [
			"github:quartz-community/explorer",
		]);
		expect(addResult.exitCode).toBe(0);
		const removeResult = runQuartzPlugin(quartzDir, "remove", ["explorer"]);
		expect(removeResult.exitCode).toBe(0);
		const pluginPath = join(quartzDir, ".quartz", "plugins", "explorer");
		expect(existsSync(pluginPath)).toBe(false);
		const userConfig = readUserQuartzConfig(quartzDir);
		if (userConfig) {
			const stillPresent = userConfig.includes("explorer");
			console.info(
				`Quartz config retains explorer after remove: ${stillPresent}`,
			);
		} else {
			console.info(
				"No quartz.config.yaml found after plugin remove; default config remains in use.",
			);
		}
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Plugin Remove\npublish: true\n---\nRemoved plugin",
		);
		const buildResult = await runQuartzBuild(quartzDir);
		expect(buildResult.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
	}, 120_000);

	it("Install plugins from config", async () => {
		const installResult = runQuartzPlugin(quartzDir, "install");
		expect(installResult.exitCode).toBe(0);
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Plugin Install\npublish: true\n---\nInstalled plugins",
		);
		const buildResult = await runQuartzBuild(quartzDir);
		expect(buildResult.exitCode).toBe(0);
		expect(outputExists(quartzDir)).toBe(true);
	}, 120_000);

	it("Add non-existent plugin fails gracefully", () => {
		const result = runQuartzPlugin(quartzDir, "add", [
			"github:nonexistent-org/nonexistent-plugin-12345",
		]);
		console.info(`Non-existent plugin add exit ${result.exitCode}`);
		const output = result.stdout + result.stderr;
		expect(output).toContain("Failed to add");
	}, 120_000);

	it("Build after adding and then removing a plugin", async () => {
		const addResult = runQuartzPlugin(quartzDir, "add", [
			"github:quartz-community/explorer",
		]);
		expect(addResult.exitCode).toBe(0);
		writeNoteToQuartz(
			quartzDir,
			"index.md",
			"---\ntitle: Plugin Lifecycle\npublish: true\n---\nLifecycle test",
		);
		const buildAfterAdd = await runQuartzBuild(quartzDir);
		expect(buildAfterAdd.exitCode).toBe(0);
		const removeResult = runQuartzPlugin(quartzDir, "remove", ["explorer"]);
		expect(removeResult.exitCode).toBe(0);
		const buildAfterRemove = await runQuartzBuild(quartzDir);
		expect(buildAfterRemove.exitCode).toBe(0);
	}, 120_000);
});
