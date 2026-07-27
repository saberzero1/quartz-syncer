import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import {
	createRepositoryAdapter,
	getValueByPath,
	parseCliValue,
	setValueByPath,
} from "src/cli/handlers/cliUtils";
import { buildPlugin, makeBackend } from "./helpers";

const { createGitBackend, setBackend } = vi.hoisted(() => {
	let backend: GitBackend | null = null;
	return {
		createGitBackend: vi.fn(() => {
			if (!backend) {
				throw new Error("Backend not set");
			}
			return backend;
		}),
		setBackend: (nextBackend: GitBackend) => {
			backend = nextBackend;
		},
	};
});

vi.mock("src/git/GitBackendFactory", () => ({
	createGitBackend,
}));

describe("cliUtils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("gets nested values by path", () => {
		const settings = {
			flat: "value",
			nested: { deep: 42 },
		};
		expect(getValueByPath(settings, "flat")).toBe("value");
		expect(getValueByPath(settings, "nested.deep")).toBe(42);
		expect(getValueByPath(settings, "missing.key")).toBeUndefined();
	});

	it("sets nested values by path", () => {
		const settings: Record<string, unknown> = { "flat.key": "start" };
		setValueByPath(settings, "flat.key", "updated");
		setValueByPath(settings, "nested.deep", true);

		expect(settings["flat.key"]).toBe("updated");
		expect(settings).toMatchObject({ nested: { deep: true } });
	});

	it("parses CLI values", () => {
		expect(parseCliValue("true")).toBe(true);
		expect(parseCliValue("42")).toBe(42);
		expect(parseCliValue("null")).toBeNull();
		expect(parseCliValue('{"a":1}')).toEqual({ a: 1 });
		expect(parseCliValue("plain")).toBe("plain");
	});

	it("creates repository adapters when git settings exist", async () => {
		const files = {
			"quartz.plugins.json": JSON.stringify({
				configuration: { pageTitle: "Test" },
				plugins: [],
			}),
		};
		const backend = makeBackend(files);
		setBackend(backend);
		const plugin = buildPlugin();

		const repo = createRepositoryAdapter(plugin);
		expect(repo).not.toBeNull();

		const file = await repo?.getRawFile("quartz.plugins.json");
		expect(file?.path).toBe("quartz.plugins.json");
	});

	it("returns null when git settings are missing", () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "",
			},
		});
		expect(createRepositoryAdapter(plugin)).toBeNull();
	});
});
