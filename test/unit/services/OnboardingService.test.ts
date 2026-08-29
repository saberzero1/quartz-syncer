import { OnboardingService } from "src/services/OnboardingService";
import type QuartzSyncer from "src/main";
import { NotFoundError } from "src/git/errors";

const { mockService, GitHubApiServiceMock } = vi.hoisted(() => {
	const mockService = {
		validateToken: vi.fn(),
		listRepos: vi.fn(),
		getUser: vi.fn(),
		getRepo: vi.fn(),
		createFromTemplate: vi.fn(),
		getFileContent: vi.fn(),
		createFile: vi.fn(),
		enablePages: vi.fn(),
	};

	return {
		mockService,
		GitHubApiServiceMock: vi.fn(() => mockService),
	};
});

vi.mock("src/github/GitHubApiService", () => ({
	GitHubApiService: GitHubApiServiceMock,
}));

const buildPlugin = () => {
	return {
		settings: {
			gitRemoteUrl: "",
			gitBranch: "",
			gitAuthType: "basic",
			gitProviderHint: "github",
		},
		secretStorageService: {
			setToken: vi.fn(),
		},
		saveSettings: vi.fn().mockResolvedValue(undefined),
	} as unknown as QuartzSyncer;
};

describe("OnboardingService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("delegates testToken to GitHubApiService", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);
		const user = { login: "octo" };
		mockService.validateToken.mockResolvedValue(user);

		const result = await service.testToken("token");

		expect(result).toEqual(user);
		expect(GitHubApiServiceMock).toHaveBeenCalledWith("token");
		expect(mockService.validateToken).toHaveBeenCalledWith("token");
	});

	it("delegates listRepos to GitHubApiService", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);
		const repos = [
			{
				full_name: "octo/quartz",
				html_url: "https://github.com/octo/quartz",
				clone_url: "https://github.com/octo/quartz.git",
				default_branch: "v5",
				private: false,
			},
		];
		mockService.listRepos.mockResolvedValue(repos);

		const result = await service.listRepos("token");

		expect(result).toEqual(repos);
		expect(mockService.listRepos).toHaveBeenCalled();
	});

	it("configures plugin settings", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);
		const repo = {
			full_name: "octo/quartz",
			html_url: "https://github.com/octo/quartz",
			clone_url: "https://github.com/octo/quartz.git",
			default_branch: "main",
			private: false,
		};

		await service.configure("token", repo);

		expect(plugin.settings.gitRemoteUrl).toBe(repo.clone_url);
		expect(plugin.settings.gitBranch).toBe("main");
		expect(plugin.settings.gitAuthType).toBe("bearer");
		expect(plugin.settings.gitProviderHint).toBe("github");
		expect(plugin.secretStorageService.setToken).toHaveBeenCalledWith(
			"token",
		);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("connects repo by owner/name", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);
		const repo = {
			full_name: "octo/quartz",
			html_url: "https://github.com/octo/quartz",
			clone_url: "https://github.com/octo/quartz.git",
			default_branch: "v5",
			private: false,
		};
		mockService.getRepo.mockResolvedValue(repo);

		const result = await service.connectRepo("token", "octo/quartz");

		expect(result).toEqual(repo);
		expect(mockService.getRepo).toHaveBeenCalledWith("octo", "quartz");
	});

	it("throws on invalid repo format", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);

		await expect(service.connectRepo("token", "badformat")).rejects.toThrow(
			"Invalid repository name format. Expected 'owner/repo'.",
		);
	});

	it("creates repo from template and configures pages", async () => {
		const plugin = buildPlugin();
		const service = new OnboardingService(plugin);
		const repo = {
			full_name: "octo/quartz",
			html_url: "https://github.com/octo/quartz",
			clone_url: "https://github.com/octo/quartz.git",
			default_branch: "v5",
			private: false,
		};

		mockService.getUser.mockResolvedValue({ login: "octo" });
		mockService.getRepo.mockRejectedValue(new NotFoundError());
		mockService.createFromTemplate.mockResolvedValue(repo);
		mockService.getFileContent.mockImplementation((owner, name, path) => {
			void owner;
			void name;
			if (path === "package.json") {
				return Promise.resolve({ content: "{}", sha: "1" });
			}
			if (path === "quartz.config.yaml") {
				return Promise.resolve(null);
			}
			if (path === "quartz.config.default.yaml") {
				return Promise.resolve({
					content: "baseUrl: /\nmarkdownLinkResolution: full",
					sha: "2",
				});
			}
			return Promise.resolve(null);
		});
		mockService.createFile.mockResolvedValue(undefined);
		mockService.enablePages.mockResolvedValue({
			url: "https://octo.github.io/quartz",
			status: "built",
		});

		vi.useFakeTimers();
		const promise = service.createRepo("token", "quartz", false);
		await vi.runAllTimersAsync();
		const result = await promise;
		vi.useRealTimers();

		expect(result).toEqual({ repo, pagesWarning: null });
		expect(mockService.createFromTemplate).toHaveBeenCalledWith(
			"quartz",
			false,
		);
		expect(mockService.createFile).toHaveBeenCalledWith(
			"octo",
			"quartz",
			".github/workflows/deploy.yml",
			expect.any(String),
			"Add GitHub Pages deploy workflow",
			"v5",
		);
		expect(mockService.enablePages).toHaveBeenCalledWith("octo", "quartz");

		const configCall = mockService.createFile.mock.calls.find(
			(call) => call[2] === "quartz.config.yaml",
		);
		expect(configCall?.[3]).toContain("baseUrl: octo.github.io/quartz");
		expect(configCall?.[3]).toContain("markdownLinkResolution: shortest");
	});
});
