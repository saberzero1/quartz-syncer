import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type QuartzSyncer from "src/main";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
import { QuartzCompatibility } from "src/quartz/QuartzCompatibility";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";

vi.mock("src/cli/handlers/cliUtils", () => ({
	createRepositoryAdapter: vi.fn(),
}));

vi.mock("src/quartz/QuartzVersionDetector", () => ({
	QuartzVersionDetector: { detectQuartzVersion: vi.fn() },
}));

describe("QuartzCompatibility", () => {
	const createAdapter = vi.mocked(createRepositoryAdapter);
	const detectVersion = vi.mocked(QuartzVersionDetector.detectQuartzVersion);
	// The plugin is only passed to the mocked adapter factory, never inspected.
	const plugin = {} as QuartzSyncer;
	let repo: QuartzFileSource;
	let compatibility: QuartzCompatibility;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		createAdapter.mockReset();
		detectVersion.mockReset();
		repo = {
			readFile: vi.fn<QuartzFileSource["readFile"]>(),
			writeFile: vi.fn<QuartzFileSource["writeFile"]>(),
			writeBinaryFile: vi.fn<QuartzFileSource["writeBinaryFile"]>(),
			deleteFile: vi.fn<QuartzFileSource["deleteFile"]>(),
			listDirectory: vi.fn<QuartzFileSource["listDirectory"]>(),
			listAllFiles: vi.fn<QuartzFileSource["listAllFiles"]>(),
			exists: vi.fn<QuartzFileSource["exists"]>(),
		};
		createAdapter.mockReturnValue(repo);
		detectVersion.mockResolvedValue("v5-yaml");
		compatibility = new QuartzCompatibility(plugin);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("caches detection until the 300-second TTL expires", async () => {
		detectVersion
			.mockResolvedValueOnce("v4")
			.mockResolvedValueOnce("v5-yaml");

		expect(await compatibility.getVersion()).toBe("v4");
		expect(createAdapter).toHaveBeenCalledWith(plugin);
		expect(detectVersion).toHaveBeenCalledWith(repo);
		expect(detectVersion).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(299_999);
		expect(await compatibility.getVersion()).toBe("v4");
		expect(createAdapter).toHaveBeenCalledTimes(1);
		expect(detectVersion).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);
		expect(await compatibility.getVersion()).toBe("v5-yaml");
		expect(createAdapter).toHaveBeenCalledTimes(2);
		expect(detectVersion).toHaveBeenCalledTimes(2);

		vi.advanceTimersByTime(299_999);
		expect(await compatibility.getVersion()).toBe("v5-yaml");
		expect(detectVersion).toHaveBeenCalledTimes(2);
	});

	it("shares one detection between concurrent getVersion calls", async () => {
		let resolveDetection!: (version: QuartzVersion) => void;
		detectVersion.mockReturnValueOnce(
			new Promise<QuartzVersion>((resolve) => {
				resolveDetection = resolve;
			}),
		);

		const first = compatibility.getVersion();
		const second = compatibility.getVersion();

		expect(createAdapter).toHaveBeenCalledTimes(1);
		expect(detectVersion).toHaveBeenCalledTimes(1);

		resolveDetection("v5-json");
		expect(await Promise.all([first, second])).toEqual([
			"v5-json",
			"v5-json",
		]);
		expect(detectVersion).toHaveBeenCalledTimes(1);
	});

	it("invalidate forces re-detection before the TTL expires", async () => {
		detectVersion
			.mockResolvedValueOnce("v4")
			.mockResolvedValueOnce("v5-json");

		expect(await compatibility.getVersion()).toBe("v4");
		vi.advanceTimersByTime(1000);
		expect(await compatibility.getVersion()).toBe("v4");
		expect(detectVersion).toHaveBeenCalledTimes(1);

		compatibility.invalidate();
		const refreshed = await compatibility.getVersion();

		expect(detectVersion).toHaveBeenCalledTimes(2);
		expect(createAdapter).toHaveBeenCalledTimes(2);
		expect(refreshed).toBe("v5-json");
		expect(await compatibility.getVersion()).toBe("v5-json");
		expect(detectVersion).toHaveBeenCalledTimes(2);
	});

	it("resolves unknown when detection rejects and retries on the next call", async () => {
		detectVersion.mockRejectedValueOnce(
			new Error("Repository unavailable"),
		);

		await expect(compatibility.getVersion()).resolves.toBe("unknown");
		expect(detectVersion).toHaveBeenCalledTimes(1);

		await expect(compatibility.getVersion()).resolves.toBe("v5-yaml");
		expect(detectVersion).toHaveBeenCalledTimes(2);
	});

	it("returns unknown without detecting when no repository is configured", async () => {
		createAdapter.mockReturnValue(null);

		await expect(compatibility.getVersion()).resolves.toBe("unknown");
		expect(createAdapter).toHaveBeenCalledWith(plugin);
		expect(detectVersion).toHaveBeenCalledTimes(0);
	});

	it.each<{ version: QuartzVersion; expected: boolean }>([
		{ version: "v4", expected: true },
		{ version: "v5-yaml", expected: false },
		{ version: "v5-json", expected: false },
		{ version: "unknown", expected: false },
	])(
		"isConfirmedV4 returns $expected for $version",
		async ({ version, expected }) => {
			detectVersion.mockResolvedValue(version);

			expect(await compatibility.isConfirmedV4()).toBe(expected);
			expect(detectVersion).toHaveBeenCalledTimes(1);
		},
	);

	it.each<{ version: QuartzVersion; expected: boolean }>([
		{ version: "v4", expected: false },
		{ version: "unknown", expected: false },
		{ version: "v5-yaml", expected: true },
		{ version: "v5-json", expected: true },
	])(
		"supportsV5Management returns $expected for $version",
		async ({ version, expected }) => {
			detectVersion.mockResolvedValue(version);

			expect(await compatibility.supportsV5Management()).toBe(expected);
			expect(detectVersion).toHaveBeenCalledTimes(1);
		},
	);
});
