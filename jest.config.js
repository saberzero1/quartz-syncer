module.exports = {
	preset: "ts-jest/presets/js-with-ts",
	testEnvironment: "node",
	moduleNameMapper: {
		"^src/(.*)$": "<rootDir>/src/$1",
		"^@quartz-community/remark-obsidian$":
			"<rootDir>/node_modules/@quartz-community/remark-obsidian/dist/index.js",
	},
	testPathIgnorePatterns: ["/node_modules/", "/test/e2e/"],
	transformIgnorePatterns: [
		"node_modules/(?!(unified|remark-.+|@quartz-community/remark-obsidian|unist-util-.+|mdast-util-.+|micromark|micromark-.+|decode-named-character-reference|character-entities|devlop|longest-streak|ccount|escape-string-regexp|markdown-table|zwitch|trough|bail|is-plain-obj|vfile|vfile-message|fault|format)/)",
	],
};
