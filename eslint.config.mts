import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores, defineConfig } from "eslint/config";

export default defineConfig(
	globalIgnores([
		"node_modules",
		"dist",
		"docs",
		"__mocks__",
		".obsidian-cache",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"wdio.conf.mts",
		"test",
		"test-vault",
		"e2e",
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"vitest.config.ts",
					],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- obsidianmd plugin types are untyped
	...obsidianmd.configs.recommended,
	{
		linterOptions: {
			reportUnusedDisableDirectives: "off",
		},
		rules: {
			"import/no-nodejs-modules": "error",
			"import/no-extraneous-dependencies": [
				"error",
				{
					peerDependencies: true,
					optionalDependencies: false,
					bundledDependencies: false,
				},
			],
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					acronyms: [
						"API",
						"CLI",
						"CORS",
						"CSS",
						"HTTPS",
						"ID",
						"JSON",
						"SCSS",
						"SSH",
						"UI",
						"URL",
						"YAML",
					],
					brands: [
						"Bases",
						"Canvas",
						"Codeberg",
						"Datacore",
						"Dataview",
						"Excalidraw",
						"Fantasy Statblocks",
						"GitHub",
						"GitLab",
						"Gitea",
						"IndexedDB",
						"Obsidian",
						"Quartz",
						"Quartz Syncer",
					],
				},
			],
		},
	},
);
