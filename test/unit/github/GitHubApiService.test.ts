import { GitHubApiService } from "src/github/GitHubApiService";
import type { HttpClient } from "src/git/HttpClient";
import { AuthError, ProviderError } from "src/git/errors";

describe("GitHubApiService", () => {
	let client: HttpClient;
	let service: GitHubApiService;

	beforeEach(() => {
		client = {
			get: vi.fn(),
			post: vi.fn(),
			patch: vi.fn(),
			delete: vi.fn(),
			put: vi.fn(),
			request: vi.fn(),
		} as unknown as HttpClient;
		service = new GitHubApiService("token", client);
	});

	it("rethrows authentication errors when reading file content", async () => {
		const error = new AuthError("Invalid token", 401);
		vi.mocked(client.get).mockRejectedValue(error);
		await expect(
			service.getFileContent("octo", "quartz", "package.json", "v5"),
		).rejects.toBe(error);
	});

	it("rejects a user without a login", async () => {
		vi.mocked(client.get).mockResolvedValue({
			status: 200,
			headers: {},
			data: {},
		});
		await expect(service.validateToken("token")).rejects.toThrow(
			ProviderError,
		);
	});

	it("rejects a non-array repository response with ProviderError", async () => {
		vi.mocked(client.get).mockResolvedValue({
			status: 200,
			headers: {},
			data: {},
		});
		await expect(service.listRepos()).rejects.toThrow(ProviderError);
	});

	it("rejects full repository pages after the fifty-page cap", async () => {
		const data = Array.from({ length: 100 }, () => ({
			full_name: "octo/quartz",
			default_branch: "v5",
			clone_url: "https://github.com/octo/quartz.git",
		}));
		vi.mocked(client.get).mockImplementation(async () => {
			if (vi.mocked(client.get).mock.calls.length > 50)
				throw new Error("Pagination exceeded test safety bound");
			return { status: 200, headers: {}, data };
		});
		await expect(service.listRepos()).rejects.toThrow(ProviderError);
		expect(client.get).toHaveBeenCalledTimes(50);
	});

	it("stops immediately on an empty repository page", async () => {
		vi.mocked(client.get).mockResolvedValue({
			status: 200,
			headers: {},
			data: [],
		});
		await expect(service.listRepos()).resolves.toEqual([]);
		expect(client.get).toHaveBeenCalledTimes(1);
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

	describe("base64 encoding", () => {
		it("createFile() encodes ASCII content correctly", async () => {
			vi.mocked(client.put).mockResolvedValue({
				status: 201,
				headers: {},
				data: {},
			});

			await service.createFile(
				"octo",
				"quartz",
				"test.md",
				"Hello",
				"add file",
				"main",
			);

			expect(client.put).toHaveBeenCalledWith(
				"https://api.github.com/repos/octo/quartz/contents/test.md",
				expect.objectContaining({ Authorization: "Bearer token" }),
				expect.objectContaining({ content: btoa("Hello") }),
			);
		});

		it("createFile() encodes CJK content without throwing", async () => {
			vi.mocked(client.put).mockResolvedValue({
				status: 201,
				headers: {},
				data: {},
			});

			const cjk = "日本語テスト";
			await expect(
				service.createFile(
					"octo",
					"quartz",
					"test.md",
					cjk,
					"add file",
					"main",
				),
			).resolves.not.toThrow();

			expect(client.put).toHaveBeenCalledWith(
				"https://api.github.com/repos/octo/quartz/contents/test.md",
				expect.objectContaining({ Authorization: "Bearer token" }),
				expect.objectContaining({
					content: "5pel5pys6Kqe44OG44K544OI",
				}),
			);
		});

		it("createFile() encodes emoji content without throwing", async () => {
			vi.mocked(client.put).mockResolvedValue({
				status: 201,
				headers: {},
				data: {},
			});

			await expect(
				service.createFile(
					"octo",
					"quartz",
					"test.md",
					"Hello 🌍",
					"add file",
					"main",
				),
			).resolves.not.toThrow();
		});

		it("getFileContent() decodes non-ASCII base64 correctly", async () => {
			// "日本語テスト" encoded as UTF-8 base64
			const encoded = "5pel5pys6Kqe44OG44K544OI";
			vi.mocked(client.get).mockResolvedValue({
				status: 200,
				headers: {},
				data: {
					content: encoded,
					sha: "abc123",
					encoding: "base64",
				},
			});

			const result = await service.getFileContent(
				"octo",
				"quartz",
				"test.md",
				"main",
			);
			expect(result).not.toBeNull();
			expect(result?.content).toBe("日本語テスト");
			expect(result?.sha).toBe("abc123");
		});

		it("createFile() encodes empty string without throwing", async () => {
			vi.mocked(client.put).mockResolvedValue({
				status: 201,
				headers: {},
				data: {},
			});

			await expect(
				service.createFile(
					"octo",
					"quartz",
					"test.md",
					"",
					"add file",
					"main",
				),
			).resolves.not.toThrow();

			expect(client.put).toHaveBeenCalledWith(
				"https://api.github.com/repos/octo/quartz/contents/test.md",
				expect.objectContaining({ Authorization: "Bearer token" }),
				expect.objectContaining({ content: "" }),
			);
		});
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
