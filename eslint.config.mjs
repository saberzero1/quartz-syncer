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
		ignores: ["**/*.js", ".svelte-kit/", "build/**", "jest.config.js", "scripts/*", "version-bump.mjs", "src/testVault/*", "content/*", "docs/*", "**/*.test.ts", "__mocks__/*", "src/test/*", "test/*"],

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
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		rules: {
			"obsidianmd/ui/sentence-case": "off",
		},
	},

	// 5c. Compiler integrations build detached DOM for off-screen rendering;
	// global createDiv()/createSpan() append to document.body, causing HierarchyRequestError.
	{
		files: ["src/compiler/integrations/*.ts"],
		rules: {
			"obsidianmd/prefer-create-el": "off",
			"obsidianmd/prefer-active-doc": "off",
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
			"no-unused-vars": [
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
