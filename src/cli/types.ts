/**
 * Data passed from the Obsidian CLI to the handler.
 * Boolean flags appear as `"true"`, string flags as their string value.
 */
export interface CliData {
	[key: string]: string | "true";
}

/**
 * Defines a single CLI flag.
 */
export interface CliFlag {
	/** Placeholder shown in help text (e.g., "json|text"). Omit for boolean flags. */
	value?: string;
	/** Description shown in help text. */
	description: string;
	/** Whether the flag is required. Default: false. */
	required?: boolean;
}

/** Map of flag names to their definitions. */
export type CliFlags = Record<string, CliFlag>;

/** Handler function invoked by the CLI. Must return a string for terminal output. */
export type CliHandler = (params: CliData) => string | Promise<string>;

/**
 * Type for the registerCliHandler function bound from the plugin.
 */
export type RegisterFn = (
	command: string,
	description: string,
	flags: CliFlags | null,
	handler: CliHandler,
) => void;

/**
 * Augment the Plugin class with registerCliHandler.
 * This method may not exist on older Obsidian versions.
 */
export interface RegisterCliHandlerTarget {
	registerCliHandler(
		command: string,
		description: string,
		flags: CliFlags | null,
		handler: CliHandler,
	): void;
}
