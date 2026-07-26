export interface CliParams {
	args: Record<string, string>;
	flags: Set<string>;
}

export interface CliResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

export type CliHandler = (params: CliParams) => Promise<CliResult>;
