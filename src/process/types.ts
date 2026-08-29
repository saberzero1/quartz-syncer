export const ALLOWED_BINARIES = ["git", "npm", "npx", "node"] as const;
export type AllowedBinary = (typeof ALLOWED_BINARIES)[number];

export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	killed: boolean;
	error?: string;
}

export interface ProcessConfig {
	binary: AllowedBinary;
	args: string[];
	cwd: string;
	timeout?: number;
	signal?: AbortSignal;
	onStdout?: (line: string) => void;
	onStderr?: (line: string) => void;
}

export interface BinaryInfo {
	name: AllowedBinary;
	path: string | null;
	version: string | null;
	available: boolean;
}
