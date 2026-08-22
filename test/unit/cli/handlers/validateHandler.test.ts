import { beforeEach, describe, expect, it, vi } from "vitest";
import { createValidateHandler } from "src/cli/handlers/validateHandler";
import { buildParams, buildPlugin } from "./helpers";

const { createRepositoryAdapter } = vi.hoisted(() => ({
	createRepositoryAdapter: vi.fn(),
}));

const { detectQuartzVersion } = vi.hoisted(() => ({
	detectQuartzVersion: vi.fn(),
}));

vi.mock("src/cli/handlers/cliUtils", () => ({
	createRepositoryAdapter,
}));

vi.mock("src/quartz/QuartzVersionDetector", () => ({
	QuartzVersionDetector: { detectQuartzVersion },
}));

describe("validateHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reports valid lockfile when present", async () => {
		const repo = {
			readFile: vi.fn(async (path: string) => {
				if (path === "quartz.plugins.json") {
					return JSON.stringify({
						configuration: { pageTitle: "Test" },
						plugins: [],
					});
				}
				if (path === "quartz.lock.json") {
					return JSON.stringify({ plugins: { graph: "1.0.0" } });
				}
				return null;
			}),
			exists: vi.fn(async () => true),
		};
		createRepositoryAdapter.mockReturnValue(repo);
		detectQuartzVersion.mockResolvedValue("v5-json");
		const plugin = buildPlugin();
		const handler = createValidateHandler(plugin);

		const result = await handler(buildParams());
		const checks = (
			result.data as {
				checks: Array<{ check: string; passed: boolean }>;
			}
		).checks;
		const lockPresent = checks.find(
			(check) => check.check === "Plugin lockfile present",
		);
		const lockValid = checks.find(
			(check) => check.check === "Plugin lockfile valid",
		);
		expect(lockPresent?.passed).toBe(true);
		expect(lockValid?.passed).toBe(true);
		expect(result.success).toBe(true);
	});

	it("treats missing lockfile as a warning", async () => {
		const repo = {
			readFile: vi.fn(async (path: string) => {
				if (path === "quartz.plugins.json") {
					return JSON.stringify({
						configuration: { pageTitle: "Test" },
						plugins: [],
					});
				}
				return null;
			}),
			exists: vi.fn(async () => true),
		};
		createRepositoryAdapter.mockReturnValue(repo);
		detectQuartzVersion.mockResolvedValue("v5-json");
		const plugin = buildPlugin();
		const handler = createValidateHandler(plugin);

		const result = await handler(buildParams());
		const lockPresent = (
			result.data as {
				checks: Array<{ check: string; passed: boolean }>;
			}
		).checks.find((check) => check.check === "Plugin lockfile present");
		expect(lockPresent?.passed).toBe(false);
		expect(result.success).toBe(true);
	});

	it("fails when lockfile is present but invalid", async () => {
		const repo = {
			readFile: vi.fn(async (path: string) => {
				if (path === "quartz.plugins.json") {
					return JSON.stringify({
						configuration: { pageTitle: "Test" },
						plugins: [],
					});
				}
				if (path === "quartz.lock.json") {
					return JSON.stringify({ plugins: "invalid" });
				}
				return null;
			}),
			exists: vi.fn(async () => true),
		};
		createRepositoryAdapter.mockReturnValue(repo);
		detectQuartzVersion.mockResolvedValue("v5-json");
		const plugin = buildPlugin();
		const handler = createValidateHandler(plugin);

		const result = await handler(buildParams());
		const lockValid = (
			result.data as {
				checks: Array<{ check: string; passed: boolean }>;
			}
		).checks.find((check) => check.check === "Plugin lockfile valid");
		expect(lockValid?.passed).toBe(false);
		expect(result.success).toBe(false);
	});
});
