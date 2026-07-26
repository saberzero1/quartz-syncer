import { describe, expect, it } from "vitest";
import { formatCliOutput } from "src/cli/formatOutput";

describe("formatCliOutput", () => {
	it("formats JSON output", () => {
		const result = { success: true, data: { ok: true } };
		const output = formatCliOutput(result, "json");

		expect(output).toBe(JSON.stringify(result, null, 2));
	});

	it("formats text output", () => {
		const result = { success: true, data: { message: "All good" } };
		const output = formatCliOutput(result, "text");

		expect(output).toBe(`Success: ${JSON.stringify(result.data, null, 2)}`);
	});
});
