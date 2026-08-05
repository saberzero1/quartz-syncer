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
	args: Array<{ name: string; description: string; required?: boolean }>;
	flags: Array<{ name: string; description: string }>;
	examples: string[];
};
