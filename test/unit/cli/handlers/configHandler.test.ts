import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigHandler } from "src/cli/handlers/configHandler";
import { DEFAULT_SETTINGS } from "src/main";
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

	it("resets non-preserved settings when forced", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				contentFolder: "docs",
				useDataview: false,
			},
		});
		const handler = createConfigHandler(plugin);

		const result = await handler(
			buildParams({ action: "reset" }, ["force"]),
		);
		expect(result.success).toBe(true);
		const data = result.data as { reset: boolean; changed: string[] };
		expect(data).toMatchObject({ reset: true });
		expect(data.changed).toEqual(
			expect.arrayContaining(["contentFolder", "useDataview"]),
		);
		expect(plugin.settings.contentFolder).toBe(
			DEFAULT_SETTINGS.contentFolder,
		);
		expect(plugin.settings.useDataview).toBe(DEFAULT_SETTINGS.useDataview);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("preserves identity settings during reset", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "https://example.com/custom.git",
				gitBranch: "custom-branch",
				gitAuthType: "bearer",
				gitAuthUsername: "custom-user",
				quartzRepoPath: "/tmp/quartz",
				settingsSchemaVersion: 99,
				pluginVersion: "9.9.9",
			},
		});
		const handler = createConfigHandler(plugin);

		const result = await handler(
			buildParams({ action: "reset" }, ["force"]),
		);
		expect(result.success).toBe(true);
		expect(plugin.settings.gitRemoteUrl).toBe(
			"https://example.com/custom.git",
		);
		expect(plugin.settings.gitBranch).toBe("custom-branch");
		expect(plugin.settings.gitAuthType).toBe("bearer");
		expect(plugin.settings.gitAuthUsername).toBe("custom-user");
		expect(plugin.settings.quartzRepoPath).toBe("/tmp/quartz");
		expect(plugin.settings.settingsSchemaVersion).toBe(99);
		expect(plugin.settings.pluginVersion).toBe("9.9.9");
	});

	it("requires force for reset", async () => {
		const plugin = buildPlugin();
		const handler = createConfigHandler(plugin);

		const result = await handler(buildParams({ action: "reset" }));
		expect(result).toEqual({
			success: false,
			error: "Config reset requires the 'force' flag.",
		});
	});

	it("returns empty changes when already at defaults", async () => {
		const plugin = buildPlugin({
			settings: {
				...DEFAULT_SETTINGS,
				gitRemoteUrl: "https://example.com/custom.git",
				gitBranch: "custom-branch",
			},
		});
		const handler = createConfigHandler(plugin);

		const result = await handler(
			buildParams({ action: "reset" }, ["force"]),
		);
		expect(result).toEqual({
			success: true,
			data: { reset: true, changed: [] },
		});
	});
});
