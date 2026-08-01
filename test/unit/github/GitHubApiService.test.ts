import { GitHubApiService } from "src/github/GitHubApiService";
import type { HttpClient } from "src/git/HttpClient";
import { AuthError } from "src/git/errors";

describe("GitHubApiService", () => {
	let client: HttpClient;
	let service: GitHubApiService;

	beforeEach(() => {
		client = {
			get: vi.fn(),
			post: vi.fn(),
			patch: vi.fn(),
			delete: vi.fn(),
			request: vi.fn(),
		} as unknown as HttpClient;
		service = new GitHubApiService("token", client);
	});

	it("validates token and returns user", async () => {
		vi.mocked(client.get).mockResolvedValue({
			status: 200,
			headers: {},
			data: { login: "octo", name: "Octo" },
		});

		const user = await service.validateToken("token");
		expect(user.login).toBe("octo");
		expect(client.get).toHaveBeenCalledWith(
			"https://api.github.com/user",
			expect.objectContaining({ Authorization: "Bearer token" }),
		);
	});

	it("throws on invalid token", async () => {
		vi.mocked(client.get).mockRejectedValue(
			new AuthError("Authentication failed (401)", 401),
		);

		await expect(service.validateToken("bad")).rejects.toThrow(AuthError);
	});

	it("creates repository from template", async () => {
		vi.mocked(client.get).mockResolvedValueOnce({
			status: 200,
			headers: {},
			data: { login: "octo" },
		});
		vi.mocked(client.post).mockResolvedValue({
			status: 201,
			headers: {},
			data: {
				full_name: "octo/quartz",
				html_url: "https://github.com/octo/quartz",
				clone_url: "https://github.com/octo/quartz.git",
				default_branch: "v4",
				private: false,
			},
		});

		const repo = await service.createFromTemplate("quartz");
		expect(repo.full_name).toBe("octo/quartz");
		expect(client.post).toHaveBeenCalledWith(
			"https://api.github.com/repos/jackyzha0/quartz/generate",
			expect.objectContaining({ Authorization: "Bearer token" }),
			{ owner: "octo", name: "quartz", private: false },
		);
	});

	it("enables Pages on default branch", async () => {
		vi.mocked(client.get).mockResolvedValueOnce({
			status: 200,
			headers: {},
			data: {
				full_name: "octo/quartz",
				html_url: "https://github.com/octo/quartz",
				clone_url: "https://github.com/octo/quartz.git",
				default_branch: "main",
				private: false,
			},
		});
		vi.mocked(client.post).mockResolvedValueOnce({
			status: 201,
			headers: {},
			data: { url: "https://octo.github.io/quartz", status: "built" },
		});

		const config = await service.enablePages("octo", "quartz");
		expect(config.status).toBe("built");
		expect(client.post).toHaveBeenCalledWith(
			"https://api.github.com/repos/octo/quartz/pages",
			expect.objectContaining({ Authorization: "Bearer token" }),
			{ build_type: "workflow", source: { branch: "main", path: "/" } },
		);
	});
});
