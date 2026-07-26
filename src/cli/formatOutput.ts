import type { CliResult } from "src/cli/types";

export function formatCliOutput(
	result: CliResult,
	format: "json" | "text",
): string {
	if (format === "json") {
		return JSON.stringify(result, null, 2);
	}

	if (!result.success) {
		return `Error: ${result.error ?? "Unknown error"}`;
	}

	if (typeof result.data === "string") {
		return result.data;
	}

	if (result.data === undefined) {
		return "Success";
	}

	return `Success: ${JSON.stringify(result.data, null, 2)}`;
}
