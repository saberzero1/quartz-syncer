export interface CliParams {
	args: Record<string, string>;
	flags: Set<string>;
	verbose: boolean;
}

export interface CliResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

export type CliHandler = (params: CliParams) => Promise<CliResult>;

export type CommandMeta = {
	name: string;
	description: string;
	args: ReadonlyArray<{
		name: string;
		description: string;
		required?: boolean;
	}>;
	flags: ReadonlyArray<{ name: string; description: string }>;
	examples: readonly string[];
	/**
	 * Whether this command can compile notes.
	 *
	 * Only these commands open a dynamic compilation session at dispatch, which
	 * is also what forces a Publisher to be constructed. Leave unset for
	 * commands that never compile.
	 */
	compiles?: boolean;
};
