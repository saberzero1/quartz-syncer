import { requestUrl } from "obsidian";
import {
	AuthError,
	NetworkError,
	RateLimitError,
	ConflictError,
	NotFoundError,
} from "./errors";

export interface HttpResponse<T = unknown> {
	status: number;
	headers: Record<string, string>;
	data: T;
}

export type RateLimitCallback = (remaining: number, reset?: number) => void;

export interface HttpClientOptions {
	maxRetries?: number;
	onRateLimit?: RateLimitCallback;
}

interface IsomorphicGitHttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: AsyncIterableIterator<Uint8Array>;
	onProgress?: (progress: {
		phase: string;
		loaded: number;
		total: number;
	}) => void;
	signal?: object;
}

interface IsomorphicGitHttpResponse {
	url: string;
	method?: string;
	headers: Record<string, string>;
	body?: AsyncIterableIterator<Uint8Array>;
	statusCode: number;
	statusMessage: string;
}

async function collectBody(
	body?: AsyncIterableIterator<Uint8Array>,
): Promise<Uint8Array | undefined> {
	if (!body) return undefined;
	const chunks: Uint8Array[] = [];
	let totalLength = 0;
	for await (const chunk of body) {
		chunks.push(chunk);
		totalLength += chunk.length;
	}
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

function normalizeHeaders(
	headers: Record<string, string | string[]>,
): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key.toLowerCase()] = Array.isArray(value)
			? value.join(", ")
			: value;
	}
	return normalized;
}

function mapHttpError(status: number, url: string, body?: string): never {
	if (status === 401 || status === 403) {
		throw new AuthError(`Authentication failed (${status})`, status);
	}
	if (status === 404) {
		throw new NotFoundError(`Not found: ${url}`, url);
	}
	if (status === 409 || status === 422) {
		throw new ConflictError(`Conflict (${status}): ${body ?? ""}`, status);
	}
	if (status === 429) {
		throw new RateLimitError("Rate limit exceeded");
	}
	throw new NetworkError(`HTTP ${status}: ${body ?? ""}`);
}

function parseRateLimitHeaders(
	headers: Record<string, string>,
	onRateLimit?: RateLimitCallback,
): void {
	if (!onRateLimit) return;
	const remaining =
		headers["x-ratelimit-remaining"] ?? headers["ratelimit-remaining"];
	const reset = headers["x-ratelimit-reset"] ?? headers["ratelimit-reset"];
	if (remaining !== undefined) {
		onRateLimit(
			parseInt(remaining, 10),
			reset ? parseInt(reset, 10) : undefined,
		);
	}
}

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS = [1000, 2000, 4000];

export class HttpClient {
	private maxRetries: number;
	private onRateLimit?: RateLimitCallback;

	constructor(options: HttpClientOptions = {}) {
		this.maxRetries = options.maxRetries ?? 3;
		this.onRateLimit = options.onRateLimit;
	}

	async get<T>(
		url: string,
		headers: Record<string, string> = {},
	): Promise<HttpResponse<T>> {
		return this.jsonRequest<T>("GET", url, headers);
	}

	async post<T>(
		url: string,
		headers: Record<string, string> = {},
		body?: unknown,
	): Promise<HttpResponse<T>> {
		return this.jsonRequest<T>("POST", url, headers, body);
	}

	async patch<T>(
		url: string,
		headers: Record<string, string> = {},
		body?: unknown,
	): Promise<HttpResponse<T>> {
		return this.jsonRequest<T>("PATCH", url, headers, body);
	}

	async delete<T>(
		url: string,
		headers: Record<string, string> = {},
	): Promise<HttpResponse<T>> {
		return this.jsonRequest<T>("DELETE", url, headers);
	}

	private async jsonRequest<T>(
		method: string,
		url: string,
		headers: Record<string, string>,
		body?: unknown,
	): Promise<HttpResponse<T>> {
		const requestHeaders = { ...headers };
		let requestBody: string | undefined;
		if (body !== undefined) {
			requestHeaders["Content-Type"] = "application/json";
			requestBody = JSON.stringify(body);
		}

		let lastError: unknown;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const response = await requestUrl({
					url,
					method,
					headers: requestHeaders,
					body: requestBody,
					throw: false,
				});

				const responseHeaders = normalizeHeaders(response.headers);
				parseRateLimitHeaders(responseHeaders, this.onRateLimit);

				if (response.status >= 400) {
					if (
						RETRY_STATUS_CODES.has(response.status) &&
						attempt < this.maxRetries
					) {
						const retryAfter = responseHeaders["retry-after"];
						const delay = retryAfter
							? parseInt(retryAfter, 10) * 1000
							: (RETRY_DELAYS[attempt] ?? 4000);
						await sleep(delay);
						continue;
					}
					mapHttpError(response.status, url, response.text);
				}

				return {
					status: response.status,
					headers: responseHeaders,
					data: response.json as T,
				};
			} catch (e) {
				if (
					e instanceof AuthError ||
					e instanceof NotFoundError ||
					e instanceof ConflictError ||
					e instanceof RateLimitError
				) {
					throw e;
				}
				lastError = e;
				if (attempt < this.maxRetries) {
					await sleep(RETRY_DELAYS[attempt] ?? 4000);
					continue;
				}
			}
		}
		throw new NetworkError("Request failed after retries", lastError);
	}

	async request(
		request: IsomorphicGitHttpRequest,
	): Promise<IsomorphicGitHttpResponse> {
		const method = request.method ?? "GET";
		const bodyBytes = await collectBody(request.body);

		let lastError: unknown;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const response = await requestUrl({
					url: request.url,
					method,
					headers: request.headers ?? {},
					body: bodyBytes
						? new Uint8Array(bodyBytes).buffer
						: undefined,
					throw: false,
				});

				const responseHeaders = normalizeHeaders(response.headers);
				parseRateLimitHeaders(responseHeaders, this.onRateLimit);

				if (
					RETRY_STATUS_CODES.has(response.status) &&
					attempt < this.maxRetries
				) {
					await sleep(RETRY_DELAYS[attempt] ?? 4000);
					continue;
				}

				const responseBody = new Uint8Array(response.arrayBuffer);

				return {
					url: request.url,
					method,
					headers: responseHeaders,
					body: (async function* () {
						yield responseBody;
					})(),
					statusCode: response.status,
					statusMessage: `${response.status}`,
				};
			} catch (e) {
				lastError = e;
				if (attempt < this.maxRetries) {
					await sleep(RETRY_DELAYS[attempt] ?? 4000);
					continue;
				}
			}
		}
		throw new NetworkError(
			"Git HTTP request failed after retries",
			lastError,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
