import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/e2e/**/*.test.ts"],
		exclude: ["**/.quartz-cache/**", "**/.quartz/**"],
		globals: true,
		testTimeout: 120_000,
		hookTimeout: 120_000,
		pool: "forks",
		sequence: {
			concurrent: false,
		},
	},
	resolve: {
		alias: {
			obsidian: new URL(
				"test/unit/__mocks__/obsidian.ts",
				import.meta.url,
			).pathname,
			src: new URL("src", import.meta.url).pathname,
		},
	},
});
