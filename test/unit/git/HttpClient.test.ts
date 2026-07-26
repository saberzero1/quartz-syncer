import { HttpClient } from "src/git/HttpClient";
import {
	AuthError,
	NotFoundError,
	RateLimitError,
	NetworkError,
} from "src/git/errors";

const mockRequestUrl = vi.fn();
vi.mock("obsidian", () => ({
	requestUrl: (...args: unknown[]) => mockRequestUrl(...args),
}));

function mockResponse(
	status: number,
	body: unknown = {},
	headers: Record<string, string> = {},
) {
	return {
		status,
		headers,
		json: body,
		text: JSON.stringify(body),
		arrayBuffer: new ArrayBuffer(0),
	};
}

describe("HttpClient", () => {
	let client: HttpClient;

	beforeEach(() => {
		mockRequestUrl.mockReset();
		client = new HttpClient({ maxRetries: 2 });
	});

	describe("JSON convenience methods", () => {
		it("makes GET requests", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(200, { id: 1 }));
			const result = await client.get<{ id: number }>(
				"https://api.example.com/test",
				{ Authorization: "Bearer token" },
			);
			expect(result.status).toBe(200);
			expect(result.data.id).toBe(1);
			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.example.com/test",
					method: "GET",
				}),
			);
		});

		it("makes POST requests with body", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(201, { sha: "abc" }));
			const result = await client.post<{ sha: string }>(
				"https://api.example.com/test",
				{},
				{ content: "hello" },
			);
			expect(result.status).toBe(201);
			expect(result.data.sha).toBe("abc");
			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					method: "POST",
					body: '{"content":"hello"}',
				}),
			);
		});
	});

	describe("error mapping", () => {
		it("throws AuthError on 401", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(401));
			await expect(
				client.get("https://api.example.com/test"),
			).rejects.toThrow(AuthError);
		});

		it("throws AuthError on 403", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(403));
			await expect(
				client.get("https://api.example.com/test"),
			).rejects.toThrow(AuthError);
		});

		it("throws NotFoundError on 404", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(404));
			await expect(
				client.get("https://api.example.com/test"),
			).rejects.toThrow(NotFoundError);
		});

		it("throws RateLimitError on 429 after retries", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(429));
			await expect(
				client.get("https://api.example.com/test"),
			).rejects.toThrow(RateLimitError);
		});
	});

	describe("retry logic", () => {
		it("retries on 429 then succeeds", async () => {
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(429))
				.mockResolvedValueOnce(mockResponse(200, { ok: true }));

			const result = await client.get<{ ok: boolean }>(
				"https://api.example.com/test",
			);
			expect(result.data.ok).toBe(true);
			expect(mockRequestUrl).toHaveBeenCalledTimes(2);
		});

		it("retries on 500 then succeeds", async () => {
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(500))
				.mockResolvedValueOnce(mockResponse(200, { ok: true }));

			const result = await client.get<{ ok: boolean }>(
				"https://api.example.com/test",
			);
			expect(result.data.ok).toBe(true);
			expect(mockRequestUrl).toHaveBeenCalledTimes(2);
		});

		it("throws NetworkError after max retries on 500", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse(500));
			await expect(
				client.get("https://api.example.com/test"),
			).rejects.toThrow(NetworkError);
			expect(mockRequestUrl).toHaveBeenCalledTimes(3);
		});
	});

	describe("rate limit header parsing", () => {
		it("calls onRateLimit with remaining count", async () => {
			const onRateLimit = vi.fn();
			client = new HttpClient({ maxRetries: 0, onRateLimit });
			mockRequestUrl.mockResolvedValue(
				mockResponse(200, {}, { "X-RateLimit-Remaining": "42" }),
			);

			await client.get("https://api.example.com/test");
			expect(onRateLimit).toHaveBeenCalledWith(42, undefined);
		});

		it("parses reset timestamp", async () => {
			const onRateLimit = vi.fn();
			client = new HttpClient({ maxRetries: 0, onRateLimit });
			mockRequestUrl.mockResolvedValue(
				mockResponse(
					200,
					{},
					{
						"X-RateLimit-Remaining": "10",
						"X-RateLimit-Reset": "1700000000",
					},
				),
			);

			await client.get("https://api.example.com/test");
			expect(onRateLimit).toHaveBeenCalledWith(10, 1700000000);
		});
	});

	describe("isomorphic-git HttpClient interface", () => {
		it("implements request() returning statusCode and headers", async () => {
			mockRequestUrl.mockResolvedValue({
				status: 200,
				headers: {
					"Content-Type": "application/x-git-upload-pack-result",
				},
				arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
			});

			const response = await client.request({
				url: "https://github.com/user/repo.git/info/refs?service=git-upload-pack",
				method: "GET",
				headers: {},
			});

			expect(response.statusCode).toBe(200);
			expect(response.url).toBe(
				"https://github.com/user/repo.git/info/refs?service=git-upload-pack",
			);
			expect(response.headers).toBeDefined();

			const chunks: Uint8Array[] = [];
			if (response.body) {
				for await (const chunk of response.body) {
					chunks.push(chunk);
				}
			}
			expect(chunks.length).toBe(1);
			expect(chunks[0]?.length).toBe(3);
		});
	});
});
