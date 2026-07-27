import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBackend } from "src/git/types";
import { createTestHandler } from "src/cli/handlers/testHandler";
import { buildParams, buildPlugin } from "./helpers";

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

describe("testHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tests git connection when configured", async () => {
		const backend = {
			testConnection: vi.fn(async () => ({
				ok: true,
				readAccess: true,
				writeAccess: true,
			})),
		} as unknown as GitBackend;
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: true,
			data: {
				ok: true,
				readAccess: true,
				writeAccess: true,
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({
			settings: {
				...buildPlugin().settings,
				gitRemoteUrl: "",
			},
		});
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});

	it("returns connection errors from the backend", async () => {
		const backend = {
			testConnection: vi.fn(async () => ({
				ok: false,
				readAccess: false,
				writeAccess: false,
				error: "Connection failed",
			})),
		} as unknown as GitBackend;
		setBackend(backend);
		const plugin = buildPlugin();
		const handler = createTestHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Connection failed",
		});
	});
});
