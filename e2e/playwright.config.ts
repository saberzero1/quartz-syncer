import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 60_000,
	retries: 0,
	use: {
		baseURL: "http://localhost:8080",
	},
	webServer: [],
});
