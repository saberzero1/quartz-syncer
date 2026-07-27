import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigHandler } from "src/cli/handlers/configHandler";
import { buildParams, buildPlugin } from "./helpers";

describe("configHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists settings when no action is provided", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const result = await handler(buildParams());
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			gitBranch: "main",
			gitRemoteUrl: "https://example.com/repo.git",
		});
	});

	it("gets and sets settings by key", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const getResult = await handler(
			buildParams({ action: "get", key: "gitBranch" }),
		);
		expect(getResult).toEqual({
			success: true,
			data: { key: "gitBranch", value: "main" },
		});

		const setResult = await handler(
			buildParams({ action: "set", key: "gitBranch", value: "dev" }),
		);
		expect(setResult).toEqual({
			success: true,
			data: { key: "gitBranch", value: "dev" },
		});
		expect(plugin.settings.gitBranch).toBe("dev");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("parses primitive values on set", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const result = await handler(
			buildParams({
				action: "set",
				key: "enableSystemCommands",
				value: "true",
			}),
		);
		expect(result).toEqual({
			success: true,
			data: { key: "enableSystemCommands", value: true },
		});
		expect(plugin.settings.enableSystemCommands).toBe(true);
	});

	it("returns errors for missing parameters", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const missingKey = await handler(buildParams({ action: "get" }));
		expect(missingKey).toEqual({
			success: false,
			error: "Missing key parameter",
		});

		const missingValue = await handler(
			buildParams({ action: "set", key: "gitBranch" }),
		);
		expect(missingValue).toEqual({
			success: false,
			error: "Missing value parameter",
		});
	});

	it("returns an error for unknown actions", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const result = await handler(buildParams({ action: "rename" }));
		expect(result).toEqual({
			success: false,
			error: "Unknown action: rename",
		});
	});
});
