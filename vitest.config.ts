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
			// Calibrated against Node 24, which is the only version CI measures
			// coverage on: v8 reports different denominators per Node version,
			// so these numbers are meaningless on 20.x or 22.x. See lint.yml.
			//
			// Every value carries headroom on purpose, and autoUpdate is off.
			// v8 reports 2073/2719, 2074/2720 or 2075/2721 branches for the same
			// tree depending on worker count, because cliUtils is loaded both
			// mocked and unmocked and the per-worker merge differs. autoUpdate
			// would pin each threshold to the luckiest run any machine produced,
			// which is what made CI fail at 76.24 against a locally written
			// 76.25. Measured on Node 24: 46.98 / 76.24 / 56.23 / 46.98.
			thresholds: {
				autoUpdate: false,
				statements: 46.9,
				branches: 76,
				functions: 56,
				lines: 46.9,
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
