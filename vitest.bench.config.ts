import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	define: {
		__DEV__: "true",
	},
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
			obsidian: fileURLToPath(
				new URL("test/unit/__mocks__/obsidian.ts", import.meta.url),
			),
			"obsidian-extended-metadatacache": fileURLToPath(
				new URL(
					"__mocks__/obsidian-extended-metadatacache.ts",
					import.meta.url,
				),
			),
			src: fileURLToPath(new URL("src", import.meta.url)),
		},
	},
});
