import assert from "node:assert";
import {
	isPreflightExempt,
	isUserOwnedPath,
	USER_OWNED_FILES,
} from "./fileOwnership";

describe("isUserOwnedPath", () => {
	it.each([
		"quartz.config.yaml",
		"quartz.lock.json",
		"quartz.ts",
		"quartz/styles/custom.scss",
	])("classifies %s as user-owned", (filepath) => {
		assert.strictEqual(isUserOwnedPath(filepath), true);
	});

	it.each([
		"content/notes/hello.md",
		"content/index.md",
		"content/sub/deep/file.md",
	])("classifies %s as user-owned (content directory)", (filepath) => {
		assert.strictEqual(isUserOwnedPath(filepath), true);
	});

	it.each([
		".github/workflows/deploy.yaml",
		".github/workflows/deploy.yml",
		".github/CNAME",
	])("classifies %s as user-owned (.github directory)", (filepath) => {
		assert.strictEqual(isUserOwnedPath(filepath), true);
	});

	it.each(["quartz/static/icon.png", "quartz/static/og-image.png"])(
		"classifies %s as user-owned (static assets)",
		(filepath) => {
			assert.strictEqual(isUserOwnedPath(filepath), true);
		},
	);

	it.each([
		"quartz/styles/syncer/_index.scss",
		"quartz/styles/syncer/_datacore.scss",
		"quartz/styles/syncer/_excalidraw.scss",
		"quartz/styles/syncer/_auto-card-link.scss",
		"quartz/styles/syncer/_fantasy-statblocks.scss",
	])("classifies %s as user-owned (syncer styles)", (filepath) => {
		assert.strictEqual(isUserOwnedPath(filepath), true);
	});

	it.each([
		"package.json",
		"tsconfig.json",
		"quartz.config.default.yaml",
		"quartz/components/frames/default.tsx",
		"quartz/styles/base.scss",
		"quartz/plugins/loader/config-loader.ts",
		"node_modules/isomorphic-git/index.js",
		".gitignore",
	])("classifies %s as framework", (filepath) => {
		assert.strictEqual(isUserOwnedPath(filepath), false);
	});

	it("classifies empty string as framework", () => {
		assert.strictEqual(isUserOwnedPath(""), false);
	});

	it("does not match 'content' without trailing slash", () => {
		assert.strictEqual(isUserOwnedPath("content"), false);
	});

	it("does not match paths that start with 'content' but aren't in the directory", () => {
		assert.strictEqual(isUserOwnedPath("content-index.json"), false);
	});
});

describe("USER_OWNED_FILES", () => {
	it("contains exactly 4 entries", () => {
		assert.strictEqual(USER_OWNED_FILES.size, 4);
	});
});

describe("isPreflightExempt", () => {
	it("exempts user-owned files", () => {
		assert.strictEqual(isPreflightExempt("quartz.config.yaml"), true);
		assert.strictEqual(isPreflightExempt("content/note.md"), true);
	});

	it("exempts quartz.config.default.yaml (safe to overwrite)", () => {
		assert.strictEqual(
			isPreflightExempt("quartz.config.default.yaml"),
			true,
		);
	});

	it("does not exempt framework files", () => {
		assert.strictEqual(isPreflightExempt("package.json"), false);
		assert.strictEqual(isPreflightExempt("tsconfig.json"), false);
	});
});
