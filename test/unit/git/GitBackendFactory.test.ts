import {
	createGitBackend,
	registerBundledGitBackend,
} from "src/git/GitBackendFactory";
import { ProviderError } from "src/git/errors";
import type { GitBackend, GitBackendConfig } from "src/git/types";
import type { App } from "obsidian";

class MockBundledGitBackend implements GitBackend {
	constructor(
		public config: GitBackendConfig,
		public app: App,
	) {}
	readTree = vi.fn();
	readBlob = vi.fn();
	writeFiles = vi.fn();
	deleteFiles = vi.fn();
	getRemoteInfo = vi.fn();
	testConnection = vi.fn();
	listBranches = vi.fn();
}

const mockConfig: GitBackendConfig = {
	remoteUrl: "https://github.com/user/repo.git",
	branch: "main",
	auth: { type: "bearer", secret: "token" },
};

const mockApp = {} as App;

describe("GitBackendFactory", () => {
	beforeEach(() => {
		registerBundledGitBackend(
			MockBundledGitBackend as unknown as new (
				config: GitBackendConfig,
				app: App,
			) => GitBackend,
		);
	});

	it("returns bundled git backend for github.com URLs", () => {
		const backend = createGitBackend(mockConfig, mockApp);
		expect(backend).toBeInstanceOf(MockBundledGitBackend);
	});

	it("returns bundled git backend for codeberg.org URLs", () => {
		const backend = createGitBackend(
			{ ...mockConfig, remoteUrl: "https://codeberg.org/user/repo.git" },
			mockApp,
		);
		expect(backend).toBeInstanceOf(MockBundledGitBackend);
	});

	it("returns bundled git backend for gitlab.com URLs", () => {
		const backend = createGitBackend(
			{ ...mockConfig, remoteUrl: "https://gitlab.com/user/repo.git" },
			mockApp,
		);
		expect(backend).toBeInstanceOf(MockBundledGitBackend);
	});

	it("returns bundled git backend for self-hosted URLs", () => {
		const backend = createGitBackend(
			{
				...mockConfig,
				remoteUrl: "https://git.example.com/user/repo.git",
			},
			mockApp,
		);
		expect(backend).toBeInstanceOf(MockBundledGitBackend);
	});

	it("throws ProviderError when no backend is registered", () => {
		registerBundledGitBackend(
			null as unknown as new (
				config: GitBackendConfig,
				app: App,
			) => GitBackend,
		);
		expect(() => createGitBackend(mockConfig, mockApp)).toThrow(
			ProviderError,
		);
	});
});
