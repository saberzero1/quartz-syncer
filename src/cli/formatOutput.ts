import { CliData, CliFlags } from "./types";

const FLAG_ALIASES: Record<string, string> = {
	h: "help",
	v: "verbose",
};

const GLOBAL_FLAGS: CliFlags = {
	help: { description: "Show this help message" },
	h: { description: "Show this help message" },
	"--help": { description: "Show this help message" },
	verbose: { description: "Enable verbose output" },
	v: { description: "Enable verbose output" },
	"--verbose": { description: "Enable verbose output" },
};

export function normalizeCliParams(params: CliData): CliData {
	const normalized: CliData = {};

	for (const key of Object.keys(params)) {
		const stripped = key.replace(/^-{1,2}/, "");
		const canonical = FLAG_ALIASES[stripped] ?? stripped;
		normalized[canonical] = params[key];
	}

	return normalized;
}

export function withDashAliases(flags: CliFlags | null): CliFlags {
	const expanded: CliFlags = { ...GLOBAL_FLAGS };

	if (!flags) return expanded;

	for (const [name, flag] of Object.entries(flags)) {
		expanded[name] = flag;
		expanded[`--${name}`] = flag;
	}

	return expanded;
}

export function generateCommandHelp(
	command: string,
	description: string,
	flags: CliFlags | null,
): string {
	const lines = [`Usage: obsidian ${command} [flags]`, "", description];

	if (flags && Object.keys(flags).length > 0) {
		const canonicalFlags = Object.entries(flags).filter(
			([name]) =>
				!name.startsWith("-") &&
				!Object.keys(GLOBAL_FLAGS).includes(name),
		);

		if (canonicalFlags.length > 0) {
			lines.push("", "Flags:");

			for (const [name, flag] of canonicalFlags) {
				const valuePart = flag.value ? `=${flag.value}` : "";
				lines.push(`  ${name}${valuePart}  ${flag.description}`);
			}
		}
	}

	lines.push(
		"",
		"Global flags:",
		"  help, h        Show this help message",
		"  verbose, v     Enable verbose output",
	);

	return lines.join("\n");
}

export type CliResult = {
	ok: boolean;
	command: string;
	durationMs?: number;
	data?: unknown;
	error?: string;
	message?: string;
};

/**
 * Format a CLI result based on the requested format.
 * Returns JSON for `format=json`, human-readable text otherwise.
 * Appends duration to text output if durationMs is present.
 */
export function formatCliOutput(params: CliData, result: CliResult): string {
	if (params.format === "json") {
		return JSON.stringify(result, null, 2);
	}

	if (!result.ok) {
		return `Error: ${result.error ?? "Unknown error"}`;
	}

	const base = result.message ?? JSON.stringify(result.data);

	const duration = result.durationMs
		? ` (${(result.durationMs / 1000).toFixed(1)}s)`
		: "";

	return `${base}${duration}`;
}

/**
 * Create a standardized error result.
 */
export function cliError(command: string, error: string): CliResult {
	return { ok: false, command, error };
}

/**
 * Create a standardized success result.
 */
export function cliSuccess(
	command: string,
	message: string,
	data?: unknown,
	durationMs?: number,
): CliResult {
	return { ok: true, command, message, data, durationMs };
}
