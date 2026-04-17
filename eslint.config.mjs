import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import tsdoc from "eslint-plugin-tsdoc";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	// 1. Global ignores
	{
		ignores: ["**/*.js", ".svelte-kit/", "build/**", "jest.config.js", "scripts/*", "version-bump.mjs", "src/testVault/*", "content/*", "docs/*"],

	},

	// 2. Main ESLint recommended config
	eslint.configs.recommended,

	// 3. TypeScript configurations
	...typescriptEslint.configs.recommended,

	// 4. Svelte configuration
	...svelte.configs["flat/prettier"],

	// 5. Prettier configuration
	prettierConfig,

	// 5b. Obsidian plugin rules (scoped to TypeScript files only)
	{
		files: ["**/*.ts"],
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/commands/no-command-in-command-id": "error",
			"obsidianmd/commands/no-command-in-command-name": "error",
			"obsidianmd/commands/no-default-hotkeys": "error",
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/commands/no-plugin-name-in-command-name": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/vault/iterate": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/editor-drop-paste": "error",
			"obsidianmd/hardcoded-config-path": "error",
			"obsidianmd/no-forbidden-elements": "error",
			"obsidianmd/no-plugin-as-component": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/no-tfile-tfolder-cast": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/object-assign": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/prefer-file-manager-trash-file": "error",
			"obsidianmd/prefer-instanceof": "error",
			"obsidianmd/prefer-abstract-input-suggest": "error",
			"obsidianmd/prefer-active-window-timers": "error",
			"obsidianmd/prefer-active-doc": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/sample-names": "off",
			"obsidianmd/no-unsupported-api": "error",
			// "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
		},
	},


	// 6. TSDoc configuration
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.eslint.json",
			},
		},
		plugins: {
			tsdoc,
		},
		rules: {
			"tsdoc/syntax": "warn",
		},
	},

	// 7. Custom configuration for Svelte files
	{
		files: ["**/*.svelte"],
		languageOptions: {
			globals: {
				window: "readonly",
				document: "readonly",
				requestAnimationFrame: "readonly",
			},
			parserOptions: {
				projectService: true,
				parser: typescriptEslint.parser,
				extraFileExtensions: [".svelte"],
			},
		},
		rules: {
			"svelte/block-lang": ["error" , { script: "ts" }],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		}
	},

	// 8. Custom rules for all files
	{
		languageOptions: {
			parser: typescriptEslint.parser,
			parserOptions: {
				project: "./tsconfig.eslint.json",
			},
		},
		ignores: [ "**/*.svelte", "**/*.json", "**/*.md" ],
		plugins: {
			prettier,
		},
		rules: {
			"prettier/prettier": "error",
			"@typescript-eslint/ban-ts-comment": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-explicit-any": ["error"],
			"no-mixed-spaces-and-tabs": "off",
			"padding-line-between-statements": [
				"warn",
				{
					blankLine: "always",
					prev: "*",
					next: [
						"return",
						"if",
						"multiline-const",
						"function",
						"multiline-expression",
						"multiline-let",
						"block-like",
					],
				},
				{
					blankLine: "always",
					prev: ["function"],
					next: "*",
				},
			],
			"svelte/no-at-html-tags": "off",
		},
	},
];
