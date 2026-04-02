import type QuartzSyncer from "main";
import { createHelpHandler } from "./helpHandler";
import { CliData, RegisterFn } from "../types";

let handler: (params: CliData) => string;

const register: RegisterFn = (_cmd, _desc, _flags, h) => {
	handler = h as (params: CliData) => string;
};

const mockPlugin = {
	appVersion: "1.0.0",
} as unknown as QuartzSyncer;

describe("helpHandler", () => {
	beforeEach(() => {
		createHelpHandler(register, mockPlugin);
	});

	it("returns help text in text mode", () => {
		const result = handler({} as CliData);

		expect(result).toContain("Usage: obsidian quartz-syncer[:<command>]");
		expect(result).toContain("status");
		expect(result).toContain("sync");
		expect(result).toContain("publish");
		expect(result).toContain("delete");
		expect(result).toContain("mark");
		expect(result).toContain("test");
		expect(result).toContain("cache");
		expect(result).toContain("config");
		expect(result).toContain("upgrade");
	});

	it("returns help text in verbose mode", () => {
		const result = handler({ verbose: "true" } as CliData);

		expect(result).toContain("Usage: obsidian quartz-syncer[:<command>]");
	});

	it("returns JSON with command list when format=json", () => {
		const result = handler({ format: "json" } as CliData);
		const parsed = JSON.parse(result);

		expect(parsed.ok).toBe(true);
		expect(parsed.command).toBe("quartz-syncer");
		expect(parsed.data.commands).toHaveLength(12);
		expect(parsed.data.version).toBe("1.0.0");
	});

	it("includes global and command-specific flags in text output", () => {
		const result = handler({} as CliData);

		expect(result).toContain("format=<json|text>");
		expect(result).toContain("Global flags");
		expect(result).toContain("help, h");
		expect(result).toContain("verbose, v");
		expect(result).toContain("Command-specific flags");
		expect(result).toContain("dry-run");
		expect(result).toContain("force");
	});

	it("includes documentation link", () => {
		const result = handler({} as CliData);

		expect(result).toContain(
			"https://saberzero1.github.io/quartz-syncer-docs/",
		);
	});

	it("registers with format flag", () => {
		let capturedFlags: unknown;

		const spyRegister: RegisterFn = (_cmd, _desc, flags, _h) => {
			capturedFlags = flags;
		};

		createHelpHandler(spyRegister, mockPlugin);
		expect(capturedFlags).toHaveProperty("format");
	});
});
