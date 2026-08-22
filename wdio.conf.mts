import * as path from "path";
import * as fs from "fs";

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",
	specs: [
		"./test/specs/**/*.e2e.ts",
		"./test/scenario/specs/**/*.scenario.ts",
	],
	maxInstances: 1,

	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: "latest",
			"wdio:obsidianOptions": {
				installerVersion: "earliest",
				plugins: ["."],
				vault: "test-vault",
			},
		},
	],

	services: ["obsidian"],
	reporters: ["obsidian"],
	cacheDir: path.resolve(".obsidian-cache"),

	mochaOpts: {
		ui: "bdd",
		timeout: 60_000,
	},
	waitforInterval: 250,
	waitforTimeout: 5_000,
	logLevel: "warn",
	injectGlobals: false,

	onPrepare() {
		const workspace = path.resolve("test-vault/.obsidian/workspace.json");
		try {
			fs.unlinkSync(workspace);
		} catch {
			/* may not exist */
		}
	},
};
