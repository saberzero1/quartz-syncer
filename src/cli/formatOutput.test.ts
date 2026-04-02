import {
	cliError,
	cliSuccess,
	formatCliOutput,
	normalizeCliParams,
	generateCommandHelp,
} from "src/cli/formatOutput";
import { CliData } from "src/cli/types";

describe("formatOutput", () => {
	it("returns JSON string when format=json", () => {
		const params = { format: "json" } as CliData;
		const result = { ok: true, command: "test", message: "ok" };

		expect(formatCliOutput(params, result)).toBe(
			JSON.stringify(result, null, 2),
		);
	});

	it("returns human-readable text when format=text", () => {
		const params = { format: "text" } as CliData;
		const result = { ok: true, command: "test", message: "All good" };

		expect(formatCliOutput(params, result)).toBe("All good");
	});

	it("returns Error string for error results in text mode", () => {
		const params = { format: "text" } as CliData;
		const result = { ok: false, command: "test", error: "Boom" };

		expect(formatCliOutput(params, result)).toBe("Error: Boom");
	});

	it("appends duration suffix in text mode", () => {
		const params = { format: "text" } as CliData;

		const result = {
			ok: true,
			command: "test",
			message: "Done",
			durationMs: 1534,
		};

		expect(formatCliOutput(params, result)).toBe("Done (1.5s)");
	});

	it("falls back to JSON data when message is missing", () => {
		const params = { format: "text" } as CliData;

		const result = {
			ok: true,
			command: "test",
			data: { count: 2 },
		};

		expect(formatCliOutput(params, result)).toBe(
			JSON.stringify({ count: 2 }),
		);
	});

	it("cliError returns standard error result", () => {
		expect(cliError("cmd", "bad")).toEqual({
			ok: false,
			command: "cmd",
			error: "bad",
		});
	});

	it("cliSuccess returns standard success result", () => {
		expect(cliSuccess("cmd", "ok", { a: 1 }, 500)).toEqual({
			ok: true,
			command: "cmd",
			message: "ok",
			data: { a: 1 },
			durationMs: 500,
		});
	});
});

describe("normalizeCliParams", () => {
	it("strips double-dash prefixes", () => {
		const params = { "--dry-run": "true", "--format": "json" } as CliData;
		const normalized = normalizeCliParams(params);

		expect(normalized["dry-run"]).toBe("true");
		expect(normalized["format"]).toBe("json");
		expect(normalized["--dry-run"]).toBeUndefined();
	});

	it("strips single-dash prefixes", () => {
		const params = { "-f": "json" } as CliData;
		const normalized = normalizeCliParams(params);

		expect(normalized["f"]).toBe("json");
	});

	it("passes through keys without dashes unchanged", () => {
		const params = { format: "json", force: "true" } as CliData;
		const normalized = normalizeCliParams(params);

		expect(normalized["format"]).toBe("json");
		expect(normalized["force"]).toBe("true");
	});

	it("handles mixed dashed and undashed keys", () => {
		const params = {
			"--dry-run": "true",
			format: "json",
			"--force": "true",
		} as CliData;
		const normalized = normalizeCliParams(params);

		expect(normalized["dry-run"]).toBe("true");
		expect(normalized["format"]).toBe("json");
		expect(normalized["force"]).toBe("true");
	});

	it("resolves -h to help", () => {
		const params = { "-h": "true" } as CliData;
		const normalized = normalizeCliParams(params);

		expect(normalized["help"]).toBe("true");
		expect(normalized["h"]).toBeUndefined();
	});

	it("resolves --verbose and -v to verbose", () => {
		expect(normalizeCliParams({ "-v": "true" } as CliData)["verbose"]).toBe(
			"true",
		);

		expect(
			normalizeCliParams({ "--verbose": "true" } as CliData)["verbose"],
		).toBe("true");
	});
});

describe("generateCommandHelp", () => {
	it("generates help with flags", () => {
		const help = generateCommandHelp(
			"quartz-syncer:status",
			"Show the publish status of all marked notes",
			{
				format: {
					value: "<json|text>",
					description: "Output format (default: text)",
				},
			},
		);

		expect(help).toContain("Usage: obsidian quartz-syncer:status [flags]");
		expect(help).toContain("Show the publish status of all marked notes");
		expect(help).toContain("format=<json|text>");
		expect(help).toContain("Global flags:");
		expect(help).toContain("help, h");
		expect(help).toContain("verbose, v");
	});

	it("generates help with null flags", () => {
		const help = generateCommandHelp(
			"quartz-syncer",
			"Show available commands",
			null,
		);

		expect(help).toContain("Usage: obsidian quartz-syncer [flags]");
		expect(help).not.toContain("Flags:");
		expect(help).toContain("Global flags:");
	});

	it("shows flag with value placeholder", () => {
		const help = generateCommandHelp("quartz-syncer:mark", "Mark files", {
			path: {
				value: "<vault-path>",
				description: "File path",
			},
		});

		expect(help).toContain("path=<vault-path>");
		expect(help).toContain("File path");
	});
});
