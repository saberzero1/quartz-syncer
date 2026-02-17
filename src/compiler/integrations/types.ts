import { App } from "obsidian";
import { PublishFile } from "src/publishFile/PublishFile";
import QuartzSyncerSettings from "src/models/settings";

/**
 * Describes a text pattern that an integration handles.
 */
export interface PatternDescriptor {
	/** Unique identifier for this pattern within the integration */
	id: string;
	/** Regular expression to match (should include capture groups for content) */
	pattern: RegExp;
	/** Whether this is a block-level or inline pattern (affects whitespace handling) */
	type: "block" | "inline";
}

/**
 * Assets to inject into the Quartz project.
 */
export interface QuartzAssets {
	/**
	 * SCSS content for this integration.
	 * Will be written to quartz/styles/syncer/_\{id\}.scss
	 */
	scss?: string;
}

/**
 * Represents a matched pattern with its captured groups.
 */
export interface PatternMatch {
	/** The pattern descriptor that matched */
	descriptor: PatternDescriptor;
	/** The entire matched text */
	fullMatch: string;
	/** Captured groups from the regex */
	captures: string[];
}

/**
 * Context passed to compile methods.
 */
export interface CompileContext {
	/** Obsidian App instance */
	app: App;
	/** The file being compiled */
	file: PublishFile;
}

export type IntegrationCategory = "core" | "community";

export interface PluginIntegration {
	readonly id: string;
	readonly name: string;
	readonly settingKey: keyof QuartzSyncerSettings;
	readonly priority: number;
	readonly assets: QuartzAssets;
	readonly category: IntegrationCategory;

	/**
	 * Check if the underlying Obsidian plugin is installed and available.
	 * @returns true if the plugin is available
	 */
	isAvailable(): boolean;

	/**
	 * Returns patterns this integration handles.
	 * Called once at compile start, allowing dynamic patterns based on plugin settings.
	 * @returns Array of pattern descriptors
	 */
	getPatterns(): PatternDescriptor[];

	/**
	 * Compile a pattern match into output text.
	 * @param match - The matched pattern with captures
	 * @param context - Compilation context with app and file references
	 * @returns Compiled output text
	 */
	compile(match: PatternMatch, context: CompileContext): Promise<string>;

	/**
	 * Optional: Check if this integration should transform the entire file.
	 * Used for plugins like Excalidraw where the file itself is plugin content.
	 * @param file - The file to check
	 * @returns true if the file should be transformed
	 */
	shouldTransformFile?(file: PublishFile): boolean;

	/**
	 * Optional: Transform the entire file content.
	 * Only called if shouldTransformFile returns true.
	 * @param file - The file being transformed
	 * @param text - The current file content
	 * @param context - Compilation context
	 * @returns Transformed file content
	 */
	transformFile?(
		file: PublishFile,
		text: string,
		context: CompileContext,
	): Promise<string>;
}
