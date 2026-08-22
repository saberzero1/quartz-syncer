import { expect } from "@wdio/globals";

import {
	after,
	before,
	beforeEach,
	describe,
	it,
} from "../helpers/test-globals";
import { FixtureManager } from "../helpers/fixture-manager";
import { invokeCliHandler } from "../helpers/cli-invoker";
import { RepoAssertions } from "../helpers/repo-assertions";

describe("Config integrity", function () {
	describe("Scenario 1", function () {
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

		it("scenario 1: Config YAML roundtrip preserves structure", async function () {
			const result = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "set",
					key: "configuration.pageTitle",
					value: "Test",
				},
			);
			expect(result.success).toBe(true);

			assertions.configHasValue("configuration.pageTitle", "Test");

			const verify = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "get",
					key: "plugins",
				},
			);
			expect(verify.success).toBe(true);
		});
	});

	describe("Scenario 2", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;

		before(async function () {
			fixturePath = await fixture.create("no-user-config");
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

		it("scenario 2: Config write creates quartz.config.yaml when absent", async function () {
			const defaultBefore = fixture.readFile(
				"quartz.config.default.yaml",
			);

			const result = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "set",
					key: "configuration.pageTitle",
					value: "Test",
				},
			);
			expect(result.success).toBe(true);

			assertions.fileExists("quartz.config.yaml");
			const defaultAfter = fixture.readFile("quartz.config.default.yaml");
			expect(defaultAfter).toBe(defaultBefore);
		});
	});

	describe("Scenario 3-5", function () {
		const fixture = new FixtureManager();
		let assertions: RepoAssertions;
		let fixturePath: string;

		before(async function () {
			fixturePath = await fixture.create("customized");
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

		it("scenario 3: Config set with nested key works", async function () {
			const result = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "set",
					key: "configuration.theme.typography.header",
					value: "Inter",
				},
			);
			expect(result.success).toBe(true);
			assertions.configHasValue(
				"configuration.theme.typography.header",
				"Inter",
			);
		});

		it("scenario 4: Config get returns correct value", async function () {
			const result = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "get",
					key: "configuration.pageTitle",
				},
			);
			expect(result.success).toBe(true);
			expect(result.data).toEqual({
				key: "configuration.pageTitle",
				value: "My Custom Site",
			});
		});

		it("scenario 5: Config list returns all values", async function () {
			const result = await invokeCliHandler(
				"quartz-syncer:quartz-config",
				{
					action: "list",
				},
			);
			expect(result.success).toBe(true);
			const data = result.data as Record<string, unknown> | undefined;
			expect(data).toBeTruthy();
			expect(typeof data?.configuration).toBe("object");
		});
	});
});
