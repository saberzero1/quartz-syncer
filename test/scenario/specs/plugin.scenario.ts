import { expect } from "@wdio/globals";
import yaml from "yaml";

import { FixtureManager } from "../helpers/fixture-manager";
import { invokeCliHandler } from "../helpers/cli-invoker";
import { RepoAssertions } from "../helpers/repo-assertions";
import {
	after,
	before,
	beforeEach,
	describe,
	it,
} from "../helpers/test-globals";

type PluginEntry = { source: unknown; enabled?: boolean };

function getPlugins(fixture: FixtureManager): PluginEntry[] {
	const config = yaml.parse(fixture.readFile("quartz.config.yaml")) as {
		plugins?: PluginEntry[];
	};
	return config.plugins ?? [];
}

function findPlugin(
	plugins: PluginEntry[],
	source: string,
): PluginEntry | null {
	return (
		plugins.find((plugin) => {
			return plugin.source === source;
		}) ?? null
	);
}

describe("Plugin management", function () {
	const fixture = new FixtureManager();
	let assertions: RepoAssertions;
	let fixturePath: string;

	before(async function () {
		fixturePath = await fixture.create("multi-plugin");
		assertions = new RepoAssertions(fixture);
		await invokeCliHandler("quartz-syncer:repo", {
			action: "set-local",
			path: fixturePath,
		});
	});

	beforeEach(async function () {
		await fixture.reset();
		await invokeCliHandler("quartz-syncer:repo", {
			action: "set-local",
			path: fixturePath,
		});
		await invokeCliHandler("quartz-syncer:cache", { action: "clear" });
	});

	after(async function () {
		await fixture.destroy();
	});

	it("scenario 24: Plugin add creates correct config entry", async function () {
		const result = await invokeCliHandler("quartz-syncer:plugin", {
			action: "add",
			source: "@quartz-community/backlinks",
		});
		expect(result.success).toBe(true);

		const plugins = getPlugins(fixture);
		const entry = findPlugin(plugins, "@quartz-community/backlinks");
		expect(entry).toBeTruthy();
		expect(entry?.enabled).toBe(true);
	});

	it("scenario 25: Plugin remove preserves other entries", async function () {
		const countBefore = getPlugins(fixture).length;

		const result = await invokeCliHandler("quartz-syncer:plugin", {
			action: "remove",
			name: "@quartz-community/description",
		});
		expect(result.success).toBe(true);

		const plugins = getPlugins(fixture);
		const entry = findPlugin(plugins, "@quartz-community/description");
		expect(entry).toBeNull();
		expect(plugins.length).toBe(countBefore - 1);
	});

	it("scenario 26: Plugin add and remove roundtrip", async function () {
		const countBefore = getPlugins(fixture).length;

		const addResult = await invokeCliHandler("quartz-syncer:plugin", {
			action: "add",
			source: "@quartz-community/tag-list",
		});
		expect(addResult.success).toBe(true);
		expect(getPlugins(fixture).length).toBe(countBefore + 1);

		const removeResult = await invokeCliHandler("quartz-syncer:plugin", {
			action: "remove",
			name: "@quartz-community/tag-list",
		});
		expect(removeResult.success).toBe(true);
		expect(getPlugins(fixture).length).toBe(countBefore);
	});

	it("scenario 27: Plugin add produces valid config", async function () {
		const result = await invokeCliHandler("quartz-syncer:plugin", {
			action: "add",
			source: "@quartz-community/recent-notes",
		});
		expect(result.success).toBe(true);

		const configText = fixture.readFile("quartz.config.yaml");
		const config = yaml.parse(configText) as { plugins?: PluginEntry[] };
		expect(config.plugins).toBeTruthy();
		const entry = findPlugin(
			config.plugins ?? [],
			"@quartz-community/recent-notes",
		);
		expect(entry).toBeTruthy();
	});
});
