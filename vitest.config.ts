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
			// Ratchet, not a target: these are the measured floor, raised by
			// hand when coverage improves so it can never silently drop.
			//
			// autoUpdate stays off because it rewrites and reindents the whole
			// file, which fails prettier and buries a four-number change.
			//
			// These are exact measured values, which is only safe because the
			// numbers are now deterministic: identical across Node 22, 24 and
			// 26 and across maxWorkers 1/2/4, forks and the default pool.
			thresholds: {
				autoUpdate: false,
				statements: 41.86,
				branches: 38.97,
				functions: 45.83,
				lines: 42.31,
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
