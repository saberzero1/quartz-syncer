import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		watch: false,
		globals: true,
		setupFiles: ["test/unit/setup.ts"],
		fileParallelism: false,
		maxWorkers: 1,
		reporters: ["default"],
		disableConsoleIntercept: true,
		testTimeout: 180_000,
		benchmark: {
			include: ["test/bench/**/*.bench.ts"],
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
