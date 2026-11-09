import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/integration/**/*.test.ts"],
		globals: true,
		testTimeout: 30000,
	},
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("test/unit/__mocks__/obsidian.ts", import.meta.url),
			),
			src: fileURLToPath(new URL("src", import.meta.url)),
		},
	},
});
