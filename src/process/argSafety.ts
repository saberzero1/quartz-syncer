import { Notice, Platform } from "obsidian";

/**
 * Windows resolves `npm`/`npx` to `.cmd` shims, which cannot be spawned
 * without a shell: `CreateProcess` appends `.exe` and ignores `%PATHEXT%`
 * (ENOENT), and naming the shim explicitly is rejected with EINVAL since the
 * CVE-2024-27980 fix. Every other binary and platform runs shell-free.
 */
export function requiresWindowsShell(binary: string): boolean {
	return Platform.isWin && (binary === "npm" || binary === "npx");
}

export function assertNoControlChars(args: readonly string[]): void {
	for (const arg of args) {
		const match = /[\r\n]/.exec(arg);
		if (match) {
			const message = `Process argument contains unsupported control character ${JSON.stringify(match[0])}.`;
			new Notice(message);
			throw new RangeError(message);
		}
	}
}

export function assertNoShellMetacharacters(args: readonly string[]): void {
	for (const arg of args) {
		const match = /[&|<>^%!"'`$(){}[\];]/.exec(arg);
		if (match) {
			const message = `Process argument contains unsupported shell character ${JSON.stringify(match[0])}.`;
			new Notice(message);
			throw new RangeError(message);
		}
	}
}
