import { vi } from "vitest";
import type QuartzSyncer from "src/main";
import type { CliParams } from "src/cli/types";
import type { GitBackend } from "src/git/types";

export const buildParams = (
	args: Record<string, string> = {},
	flags: string[] = [],
): CliParams => ({
	args,
	flags: new Set(flags),
	verbose: flags.includes("verbose"),
});

export const buildPlugin = (
	overrides: Partial<QuartzSyncer> = {},
): QuartzSyncer => {
	const plugin = {
		settings: {
			gitRemoteUrl: "https://example.com/repo.git",
			gitBranch: "main",
			gitCorsProxyUrl: "",
			gitAuthType: "none",
			gitAuthUsername: "",
			gitProviderHint: "github",
			publishFrontmatterKey: "publish",
			enableSystemCommands: false,
			quartzRepoPath: "",
		},
		getGitSettingsWithSecret: vi.fn(() => ({
			remoteUrl: "https://example.com/repo.git",
			branch: "main",
			corsProxyUrl: undefined,
			auth: { type: "none" },
			providerHint: "github",
		})),
		app: { version: "1.6.0" },
		manifest: { version: "9.9.9" },
		saveSettings: vi.fn(),
		getPublisher: vi.fn(() => null),
		dataStore: null,
		secretStorageService: {},
		quartzRunner: null,
		processRunner: null,
	} as unknown as QuartzSyncer;

	return Object.assign(plugin, overrides);
};

export const makeBackend = (files: Record<string, string>): GitBackend => {
	const entries = Object.keys(files).map((path) => ({
		path,
		type: "blob" as const,
		sha: path,
	}));
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	return {
		readTree: vi.fn(async () => entries),
		readBlob: vi.fn(async (sha: string) =>
			encoder.encode(files[sha] ?? ""),
		),
		writeFiles: vi.fn(async (_branch, _message, changes) => {
			for (const change of changes) {
				files[change.path] =
					typeof change.content === "string"
						? change.content
						: decoder.decode(change.content);
			}
			return { sha: "commit" };
		}),
		deleteFiles: vi.fn(async () => ({ sha: "delete" })),
		getRemoteInfo: vi.fn(async () => ({})),
		testConnection: vi.fn(async () => ({
			ok: true,
			readAccess: true,
			writeAccess: true,
		})),
		listBranches: vi.fn(async () => []),
	} as unknown as GitBackend;
};
