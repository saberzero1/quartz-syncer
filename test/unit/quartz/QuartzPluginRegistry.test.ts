import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return {
		...actual,
		requestUrl: vi.fn(),
	};
});

const mockedRequestUrl = vi.mocked(requestUrl);

describe("QuartzPluginRegistry", () => {
	beforeEach(() => {
		mockedRequestUrl.mockReset();
	});

	it("returns parsed plugins from successful fetch", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: {
				schemaVersion: 1,
				generatedAt: "2026-01-01",
				plugins: [
					{
						name: "explorer",
						displayName: "Explorer",
						description: "Explorer",
						version: "1.0.0",
						author: "Test",
						homepage: null,
						keywords: [],
						category: "core",
						quartzVersion: "5",
						dependencies: [],
						defaultOrder: 10,
						defaultEnabled: true,
						defaultOptions: null,
						configSchema: null,
						components: null,
						frames: null,
						requiresInstall: false,
						source: "github:quartz-community/explorer",
						repo: "https://github.com/quartz-community/explorer",
						stars: 10,
						license: "MIT",
						official: true,
						lastUpdated: "2026-01-01",
						installCommand: "npx quartz plugin add",
						configureCommand: "npx quartz plugin config",
					},
				],
			},
		});

		const registry = new QuartzPluginRegistry();
		const plugins = await registry.getPlugins();

		expect(plugins).toHaveLength(1);
		expect(plugins[0]?.name).toBe("explorer");
	});

	it("returns empty array on HTTP error", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 500,
			json: { schemaVersion: 1, generatedAt: "2026-01-01", plugins: [] },
		});

		const registry = new QuartzPluginRegistry();
		await expect(registry.getPlugins()).resolves.toEqual([]);
	});

	it("returns empty array when requestUrl throws", async () => {
		mockedRequestUrl.mockRejectedValue(new Error("Network error"));

		const registry = new QuartzPluginRegistry();
		await expect(registry.getPlugins()).resolves.toEqual([]);
	});

	it("returns empty array when response has no plugins field", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: { schemaVersion: 1, generatedAt: "2026-01-01" },
		});

		const registry = new QuartzPluginRegistry();
		await expect(registry.getPlugins()).resolves.toEqual([]);
	});

	it("caches results between calls", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: {
				schemaVersion: 1,
				generatedAt: "2026-01-01",
				plugins: [],
			},
		});

		const registry = new QuartzPluginRegistry();
		await registry.getPlugins();
		await registry.getPlugins();

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
	});

	it("clearCache forces refetch", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: {
				schemaVersion: 1,
				generatedAt: "2026-01-01",
				plugins: [],
			},
		});

		const registry = new QuartzPluginRegistry();
		await registry.getPlugins();
		registry.clearCache();
		await registry.getPlugins();

		expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
	});

	it("shares in-flight request for concurrent calls", async () => {
		let resolveRequest: (value: unknown) => void = () => {};
		const pending = new Promise((resolve) => {
			resolveRequest = resolve;
		});
		mockedRequestUrl.mockReturnValueOnce(
			pending as ReturnType<typeof requestUrl>,
		);

		const registry = new QuartzPluginRegistry();
		const firstCall = registry.getPlugins();
		const secondCall = registry.getPlugins();

		expect(mockedRequestUrl).toHaveBeenCalledTimes(1);

		resolveRequest({
			status: 200,
			json: {
				schemaVersion: 1,
				generatedAt: "2026-01-01",
				plugins: [],
			},
		});

		await expect(Promise.all([firstCall, secondCall])).resolves.toEqual([
			[],
			[],
		]);
	});

	it("handles empty plugins array", async () => {
		mockedRequestUrl.mockResolvedValue({
			status: 200,
			json: {
				schemaVersion: 1,
				generatedAt: "2026-01-01",
				plugins: [],
			},
		});

		const registry = new QuartzPluginRegistry();
		await expect(registry.getPlugins()).resolves.toEqual([]);
	});
});
