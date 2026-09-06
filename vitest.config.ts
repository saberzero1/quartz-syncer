import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/unit/**/*.test.ts"],
		globals: true,
		setupFiles: ["test/unit/setup.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.d.ts", "src/models/**"],
			reporter: ["text-summary", "json-summary"],
			// Ratchet, not a target: these are the measured floor. autoUpdate
			// raises them as coverage improves, so it can never silently drop.
			thresholds: {
				autoUpdate: true,
				statements: 44.66,
				branches: 73.79,
				functions: 52.97,
				lines: 44.66,
			},
		},
	},
	resolve: {
		alias: {
			obsidian: new URL(
				"test/unit/__mocks__/obsidian.ts",
				import.meta.url,
			).pathname,
			"obsidian-extended-metadatacache": new URL(
				"__mocks__/obsidian-extended-metadatacache.ts",
				import.meta.url,
			).pathname,
			src: new URL("src", import.meta.url).pathname,
		},
	},
});
