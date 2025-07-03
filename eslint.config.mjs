import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import tsdoc from "eslint-plugin-tsdoc";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

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

	// 6. TSDoc configuration
	{
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
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
			parserOptions: {
				projectService: true,
				parser: typescriptEslint.parser,
				extraFileExtensions: [".svelte"],
			},
		},
		rules: {
			"svelte/block-lang": ["error" , { script: "ts" }],
		}
	},

	// 8. Custom rules for all files
	{
		languageOptions: {
			parser: typescriptEslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		ignores: [ "**/*.svelte" ],
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
