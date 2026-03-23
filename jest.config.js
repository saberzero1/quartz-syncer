module.exports = {
	preset: "ts-jest/presets/js-with-ts",
	testEnvironment: "node",
	moduleNameMapper: {
		"^src/(.*)$": "<rootDir>/src/$1",
	},
	testPathIgnorePatterns: ["/node_modules/", "/test/e2e/"],
};
