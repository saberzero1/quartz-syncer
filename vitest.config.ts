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
			// autoUpdate is off and branches carries headroom deliberately.
			// v8 reports 2073/2719, 2074/2720 or 2075/2721 for the same tree
			// depending on worker count, because cliUtils is loaded both mocked
			// and unmocked and the per-worker merge differs. autoUpdate pins the
			// threshold to the highest value any machine sees, so a 16-core run
			// writes 76.26 and every 2-core CI runner then fails at 76.24.
			thresholds: {
				autoUpdate: false,
				statements: 46.98,
				branches: 76,
				functions: 56.23,
				lines: 46.98,
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
