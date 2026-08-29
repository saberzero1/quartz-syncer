import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App, FileManager, MetadataCache, Vault } from "obsidian";
import { buildParams, buildPlugin } from "./helpers";

let currentValue: boolean | string | number = false;
const applyMock = vi.fn();
const setMock = vi.fn();
const removeMock = vi.fn();

vi.mock("obsidian", () => {
	class TFile {
		path = "";
	}

	return { TFile };
});

vi.mock("src/publishFile/ObsidianFrontMatterEngine", () => ({
	default: class {
		get = vi.fn(() => currentValue);
		set = vi.fn((key: string, value: boolean | string | number) => {
			setMock(key, value);
			return this;
		});
		remove = vi.fn((key: string) => {
			removeMock(key);
			return this;
		});
		apply = vi.fn(async () => {
			applyMock();
		});
	},
}));

import { TFile } from "obsidian";
import { createMarkHandler } from "src/cli/handlers/markHandler";

describe("markHandler", () => {
	beforeEach(() => {
		currentValue = false;
		applyMock.mockReset();
		setMock.mockReset();
		removeMock.mockReset();
	});

	it("toggles publish state when no state is provided", async () => {
		const file = new TFile();
		file.path = "notes/test.md";
		file.extension = "md";
		const vault = {
			getFileByPath: vi.fn(() => file),
		} as unknown as Vault;
		const metadataCache = {} as unknown as MetadataCache;
		const fileManager = {} as unknown as FileManager;
		const app = {
			version: "1.6.0",
			vault,
			metadataCache,
			fileManager,
		} as unknown as App;
		const plugin = buildPlugin({
			app,
			settings: {
				...buildPlugin().settings,
				publishFrontmatterKey: "publish",
			},
		});
		const handler = createMarkHandler(plugin);

		const result = await handler(buildParams({ path: "notes/test.md" }));
		expect(result).toEqual({
			success: true,
			data: {
				matched: ["notes/test.md"],
				matchedCount: 1,
				modified: ["notes/test.md"],
			},
		});
		expect(setMock).toHaveBeenCalledWith("publish", true);
		expect(applyMock).toHaveBeenCalledTimes(1);
	});

	it("removes the publish flag when state=unset", async () => {
		const file = new TFile();
		file.path = "notes/test.md";
		file.extension = "md";
		currentValue = true;
		const vault = {
			getFileByPath: vi.fn(() => file),
		} as unknown as Vault;
		const metadataCache = {} as unknown as MetadataCache;
		const fileManager = {} as unknown as FileManager;
		const app = {
			version: "1.6.0",
			vault,
			metadataCache,
			fileManager,
		} as unknown as App;
		const plugin = buildPlugin({
			app,
		});
		const handler = createMarkHandler(plugin);

		const result = await handler(
			buildParams({ path: "notes/test.md", state: "unset" }),
		);
		expect(result).toEqual({
			success: true,
			data: {
				matched: ["notes/test.md"],
				matchedCount: 1,
				modified: ["notes/test.md"],
			},
		});
		expect(removeMock).toHaveBeenCalledWith("publish");
		expect(applyMock).toHaveBeenCalledTimes(1);
	});

	it("returns an error when path is missing", async () => {
		const plugin = buildPlugin();
		const handler = createMarkHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Missing path parameter",
		});
	});

	it("returns an error when file is not found", async () => {
		const vault = {
			getFileByPath: vi.fn(() => null),
		} as unknown as Vault;
		const metadataCache = {} as unknown as MetadataCache;
		const fileManager = {} as unknown as FileManager;
		const app = {
			version: "1.6.0",
			vault,
			metadataCache,
			fileManager,
		} as unknown as App;
		const plugin = buildPlugin({ app });
		const handler = createMarkHandler(plugin);

		const result = await handler(buildParams({ path: "notes/missing.md" }));
		expect(result).toEqual({
			success: false,
			error: "File not found: notes/missing.md",
		});
	});

	it("returns an error when state is unknown", async () => {
		const file = new TFile();
		file.path = "notes/test.md";
		file.extension = "md";
		const vault = {
			getFileByPath: vi.fn(() => file),
		} as unknown as Vault;
		const metadataCache = {} as unknown as MetadataCache;
		const fileManager = {} as unknown as FileManager;
		const app = {
			version: "1.6.0",
			vault,
			metadataCache,
			fileManager,
		} as unknown as App;
		const plugin = buildPlugin({ app });
		const handler = createMarkHandler(plugin);

		const result = await handler(
			buildParams({ path: "notes/test.md", state: "maybe" }),
		);
		expect(result).toEqual({
			success: false,
			error: "Unknown state: maybe",
		});
	});
});
