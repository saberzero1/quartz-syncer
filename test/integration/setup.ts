import { requestUrl } from "obsidian";

try {
	process.loadEnvFile();
} catch {
	// .env file may not exist in CI (uses GitHub Actions secrets)
}

if (typeof globalThis.window === "undefined") {
	Object.defineProperty(globalThis, "window", {
		value: globalThis,
		writable: true,
	});
}

const mockedRequestUrl = requestUrl as unknown as {
	mockImplementation?: (
		implementation: (options: {
			url: string;
			method?: string;
			headers?: Record<string, string>;
			body?: string | ArrayBuffer | Uint8Array;
			throw?: boolean;
		}) => Promise<{
			status: number;
			headers: Record<string, string>;
			json: unknown;
			text: string;
			arrayBuffer: ArrayBuffer;
		}>,
	) => void;
};

mockedRequestUrl.mockImplementation?.(async (options) => {
	const response = await fetch(options.url, {
		method: options.method ?? "GET",
		headers: options.headers,
		body: options.body as BodyInit | null | undefined,
	});
	const arrayBuffer = await response.arrayBuffer();
	const text = new TextDecoder().decode(arrayBuffer);
	let json: unknown = {};
	if (text) {
		try {
			json = JSON.parse(text);
		} catch {
			json = {};
		}
	}

	return {
		status: response.status,
		headers: Object.fromEntries(response.headers.entries()),
		json,
		text,
		arrayBuffer,
	};
});

export const TEST_REPO_URL =
	"https://github.com/saberzero1/quartz-syncer-testing-bench.git";
export const TEST_BRANCH = "v5";
export const TEST_TOKEN = process.env.QUARTZ_TEST_TOKEN;

export function skipIfNoToken(): void {
	if (!TEST_TOKEN) {
		console.log("Skipping: QUARTZ_TEST_TOKEN not set");
		// Vitest: use test.skipIf or check in beforeAll
	}
}
