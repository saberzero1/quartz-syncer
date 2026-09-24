import type QuartzSyncer from "src/main";
import type { CliHandler, CliParams, CommandMeta } from "src/cli/types";
import { formatCliOutput } from "src/cli/formatOutput";
import { createStatusHandler } from "src/cli/handlers/statusHandler";
import { createSyncHandler } from "src/cli/handlers/syncHandler";
import { createPublishHandler } from "src/cli/handlers/publishHandler";
import { createDeleteHandler } from "src/cli/handlers/deleteHandler";
import { createMarkHandler } from "src/cli/handlers/markHandler";
import { createTestHandler } from "src/cli/handlers/testHandler";
import { createCacheHandler } from "src/cli/handlers/cacheHandler";
import { createConfigHandler } from "src/cli/handlers/configHandler";
import { createUpgradeHandler } from "src/cli/handlers/upgradeHandler";
import { createVersionHandler } from "src/cli/handlers/versionHandler";
import { createPluginHandler } from "src/cli/handlers/pluginHandler";
import { createQuartzConfigHandler } from "src/cli/handlers/quartzConfigHandler";
import { createQuartzBuildHandler } from "src/cli/handlers/quartzBuildHandler";
import { createQuartzServeHandler } from "src/cli/handlers/quartzServeHandler";
import { createQuartzSyncHandler } from "src/cli/handlers/quartzSyncHandler";
import { createQuartzRestoreHandler } from "src/cli/handlers/quartzRestoreHandler";
import { createRepoHandler } from "src/cli/handlers/repoHandler";
import { createMediaHandler } from "src/cli/handlers/mediaHandler";
import { createDiffHandler } from "src/cli/handlers/diffHandler";
import { createValidateHandler } from "src/cli/handlers/validateHandler";
import { createInspectHandler } from "src/cli/handlers/inspectHandler";

import type {
	CliData as ObsidianCliData,
	CliFlags as ObsidianCliFlags,
} from "obsidian";

export const COMMAND_REGISTRY = [
	{
		name: "quartz-syncer",
		description: "List available Quartz Syncer commands.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: ["obsidian quartz-syncer"],
	},
	{
		name: "quartz-syncer:status",
		description: "Show publish status of all marked notes.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{ name: "verbose", description: "Include file paths." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:status",
			"obsidian quartz-syncer:status format=json",
		],
		compiles: true,
	},
	{
		name: "quartz-syncer:sync",
		description: "Publish pending notes and delete removed notes.",
		args: [
			{ name: "message", description: "Custom commit message." },
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{ name: "force", description: "Include deletions." },
			{
				name: "dry-run",
				description: "Preview changes without executing.",
			},
			{ name: "verbose", description: "Include file paths." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:sync",
			"obsidian quartz-syncer:sync force",
		],
		compiles: true,
	},
	{
		name: "quartz-syncer:publish",
		description: "Publish pending notes only (no deletions).",
		args: [
			{
				name: "action",
				description:
					"Default publishes pending notes. Use arbitrary for arbitrary file publishing.",
			},
			{ name: "message", description: "Custom commit message." },
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{
				name: "force",
				description: "Required for arbitrary file publishing.",
			},
			{
				name: "dry-run",
				description: "Preview changes without executing.",
			},
			{ name: "verbose", description: "Include file paths." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: ["obsidian quartz-syncer:publish"],
		compiles: true,
	},
	{
		name: "quartz-syncer:delete",
		description:
			"Delete removed notes or explicitly unpublish selected notes.",
		args: [
			{
				name: "action",
				description:
					"Omit to delete removed notes; unpublish requires path.",
			},
			{
				name: "path",
				description:
					"Published note path, glob, or fuzzy query (~ prefix) for unpublish.",
			},
			{ name: "message", description: "Custom commit message." },
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{ name: "force", description: "Required for destructive deletes." },
			{
				name: "dry-run",
				description: "Preview changes without executing.",
			},
			{ name: "verbose", description: "Include file paths." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:delete force",
			"obsidian quartz-syncer:delete action=unpublish path=notes/post.md force dry-run",
			"obsidian quartz-syncer:delete action=unpublish path=notes/post.md force",
		],
		compiles: true,
	},
	{
		name: "quartz-syncer:mark",
		description: "Set/unset/toggle publish flag on notes.",
		args: [
			{
				name: "path",
				description: "Path, glob, or fuzzy query (prefix with ~).",
				required: true,
			},
			{
				name: "state",
				description: "publish, unpublish, toggle, or unset.",
			},
		],
		flags: [
			{ name: "toggle", description: "Toggle the publish state." },
			{
				name: "dry-run",
				description: "Preview matches without writing.",
			},
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:mark path=notes/post.md",
			"obsidian quartz-syncer:mark path=notes/**/*.md dry-run",
			"obsidian quartz-syncer:mark path=~my-post state=publish",
		],
	},
	{
		name: "quartz-syncer:test",
		description: "Test Git connection and credentials.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{ name: "verbose", description: "Include connection details." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: ["obsidian quartz-syncer:test"],
	},
	{
		name: "quartz-syncer:cache",
		description: "Manage the plugin cache.",
		args: [
			{
				name: "action",
				description:
					"status, clear, clear-file, export, import, prune, prune-foreign, tree-status, or tree-refresh.",
			},
			{ name: "path", description: "File path for clear-file." },
			{ name: "data", description: "JSON string for import action." },
		],
		flags: [
			{
				name: "force",
				description: "Required for prune-foreign, including dry-run.",
			},
			{
				name: "dry-run",
				description:
					"List prune-foreign candidates without deleting them.",
			},
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:cache action=status",
			"obsidian quartz-syncer:cache action=clear",
			"obsidian quartz-syncer:cache action=export",
			"obsidian quartz-syncer:cache action=prune",
			"obsidian quartz-syncer:cache action=prune-foreign force dry-run",
			"obsidian quartz-syncer:cache action=prune-foreign force",
		],
	},
	{
		name: "quartz-syncer:config",
		description: "Read or write plugin settings.",
		args: [
			{ name: "action", description: "list, get, set, or reset." },
			{ name: "key", description: "Setting key path." },
			{ name: "value", description: "Value for set action." },
		],
		flags: [
			{ name: "force", description: "Required for reset action." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:config action=list",
			"obsidian quartz-syncer:config action=get key=git.branch",
			"obsidian quartz-syncer:config action=reset force",
		],
	},
	{
		name: "quartz-syncer:upgrade",
		description: "Pull upstream Quartz changes.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{
				name: "dry-run",
				description: "Preview the update without running.",
			},
			{ name: "help", description: "Show help for this command." },
		],
		examples: ["obsidian quartz-syncer:upgrade"],
	},
	{
		name: "quartz-syncer:version",
		description: "Show plugin, Obsidian, and Quartz versions.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: ["obsidian quartz-syncer:version"],
	},
	{
		name: "quartz-syncer:plugin",
		description: "Manage Quartz v5 plugins.",
		args: [
			{
				name: "action",
				description:
					"list, add, remove, install, enable, disable, config, prune, or search.",
			},
			{
				name: "source",
				description: "Plugin source for add or install.",
			},
			{
				name: "name",
				description: "Plugin name for remove/config/enable/disable.",
			},
			{ name: "set", description: "key=value for config." },
			{ name: "query", description: "Search query for search action." },
		],
		flags: [
			{
				name: "dry-run",
				description: "Preview changes without executing.",
			},
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:plugin action=list",
			"obsidian quartz-syncer:plugin action=add source=@jackyzha0/quartz",
			"obsidian quartz-syncer:plugin action=add source=@jackyzha0/quartz dry-run",
			"obsidian quartz-syncer:plugin action=search",
			"obsidian quartz-syncer:plugin action=search query=graph",
		],
	},
	{
		name: "quartz-syncer:quartz-config",
		description: "Read or update Quartz site config.",
		args: [
			{ name: "action", description: "list, get, or set." },
			{ name: "key", description: "Config key path." },
			{ name: "value", description: "Value for set action." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:quartz-config action=list",
			"obsidian quartz-syncer:quartz-config action=get key=pageTitle",
		],
	},
	{
		name: "quartz-syncer:quartz-build",
		description: "Run Quartz build.",
		args: [],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: ["obsidian quartz-syncer:quartz-build"],
	},
	{
		name: "quartz-syncer:quartz-serve",
		description: "Run Quartz dev server.",
		args: [{ name: "port", description: "Port for the dev server." }],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:quartz-serve",
			"obsidian quartz-syncer:quartz-serve port=8081",
		],
	},
	{
		name: "quartz-syncer:quartz-sync",
		description: "Run Quartz git sync (pull/push/commit).",
		args: [
			{ name: "commit", description: "Commit changes (true or false)." },
			{ name: "push", description: "Push changes (true or false)." },
			{ name: "pull", description: "Pull changes (true or false)." },
			{ name: "message", description: "Commit message." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:quartz-sync",
			"obsidian quartz-syncer:quartz-sync pull=false",
		],
	},
	{
		name: "quartz-syncer:quartz-restore",
		description: "Restore Quartz content from cache.",
		args: [],
		flags: [
			{ name: "force", description: "Required to restore from cache." },
			{ name: "help", description: "Show help for this command." },
		],
		examples: ["obsidian quartz-syncer:quartz-restore force"],
	},
	{
		name: "quartz-syncer:repo",
		description: "Manage repository connection.",
		args: [
			{
				name: "action",
				description: "info, set-local, set-remote, or verify.",
			},
			{
				name: "path",
				description: "Local repo path for set-local or verify.",
			},
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:repo",
			"obsidian quartz-syncer:repo action=info",
			"obsidian quartz-syncer:repo action=set-local path=/path/to/quartz",
			"obsidian quartz-syncer:repo action=verify path=/path/to/quartz",
		],
	},
	{
		name: "quartz-syncer:media",
		description: "Manage media files in the Quartz repo.",
		args: [
			{
				name: "action",
				description: "list, orphaned, or clean.",
			},
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [
			{ name: "force", description: "Required for clean action." },
			{
				name: "dry-run",
				description: "Preview changes without executing.",
			},
			{ name: "help", description: "Show help for this command." },
		],
		examples: [
			"obsidian quartz-syncer:media",
			"obsidian quartz-syncer:media action=orphaned",
			"obsidian quartz-syncer:media action=clean force",
		],
		compiles: true,
	},
	{
		name: "quartz-syncer:diff",
		description: "Show compiled diff between vault and repo.",
		args: [
			{ name: "path", description: "Specific file path to diff." },
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:diff",
			"obsidian quartz-syncer:diff path=notes/post.md",
		],
		compiles: true,
	},
	{
		name: "quartz-syncer:validate",
		description: "Validate Quartz repo state.",
		args: [
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: ["obsidian quartz-syncer:validate"],
	},
	{
		name: "quartz-syncer:inspect",
		description: "Inspect internal cache, hashes, and compilation state.",
		args: [
			{
				name: "target",
				description: "cache, hashes, compilation, queue, or all.",
			},
			{ name: "path", description: "Specific file path to inspect." },
			{ name: "format", description: "Output format (json or text)." },
		],
		flags: [{ name: "help", description: "Show help for this command." }],
		examples: [
			"obsidian quartz-syncer:inspect",
			"obsidian quartz-syncer:inspect target=hashes",
			"obsidian quartz-syncer:inspect target=queue",
			"obsidian quartz-syncer:inspect target=cache path=notes/post.md",
		],
	},
] as const satisfies readonly CommandMeta[];

/**
 * Every registered command name.
 *
 * Derived from the registry so `handlers` below cannot drift from it: a
 * missing or misspelled key is a compile error, not a runtime
 * "Unknown CLI command".
 */
export type CommandName = (typeof COMMAND_REGISTRY)[number]["name"];

/** Commands that can compile, and therefore need a dynamic session. */
export const COMPILE_CAPABLE_COMMANDS: ReadonlySet<CommandName> = new Set(
	(COMMAND_REGISTRY as readonly CommandMeta[])
		.filter((entry) => entry.compiles)
		.map((entry) => entry.name as CommandName),
);

export function registerCliHandlers(
	plugin: QuartzSyncer,
): Record<CommandName, CliHandler> {
	const handlers: Record<CommandName, CliHandler> = {
		"quartz-syncer": createBaseHandler(),
		"quartz-syncer:status": createStatusHandler(plugin),
		"quartz-syncer:sync": createSyncHandler(plugin),
		"quartz-syncer:publish": createPublishHandler(plugin),
		"quartz-syncer:delete": createDeleteHandler(plugin),
		"quartz-syncer:mark": createMarkHandler(plugin),
		"quartz-syncer:test": createTestHandler(plugin),
		"quartz-syncer:cache": createCacheHandler(plugin),
		"quartz-syncer:config": createConfigHandler(plugin),
		"quartz-syncer:upgrade": createUpgradeHandler(plugin),
		"quartz-syncer:version": createVersionHandler(plugin),
		"quartz-syncer:plugin": createPluginHandler(plugin),
		"quartz-syncer:quartz-config": createQuartzConfigHandler(plugin),
		"quartz-syncer:quartz-build": createQuartzBuildHandler(plugin),
		"quartz-syncer:quartz-serve": createQuartzServeHandler(plugin),
		"quartz-syncer:quartz-sync": createQuartzSyncHandler(plugin),
		"quartz-syncer:quartz-restore": createQuartzRestoreHandler(plugin),
		"quartz-syncer:repo": createRepoHandler(plugin),
		"quartz-syncer:media": createMediaHandler(plugin),
		"quartz-syncer:diff": createDiffHandler(plugin),
		"quartz-syncer:validate": createValidateHandler(plugin),
		"quartz-syncer:inspect": createInspectHandler(plugin),
	};

	const handleCommand = async (
		command: CommandName,
		rawParams: Record<string, string> | undefined,
	): Promise<string> => {
		const meta = COMMAND_REGISTRY.find((entry) => entry.name === command);
		const params = normalizeCliParams(rawParams, meta);
		const format = params.args.format === "json" ? "json" : "text";
		if (params.flags.has("help")) {
			return formatCliOutput(
				meta
					? { success: true, data: meta }
					: {
							success: false,
							error: `Unknown CLI command: ${command}`,
						},
				format,
			);
		}
		const handler = handlers[command];

		if (!COMPILE_CAPABLE_COMMANDS.has(command)) {
			return formatCliOutput(await handler(params), format);
		}

		const publisher = plugin.getPublisher();
		publisher?.beginDynamicSession();

		try {
			return formatCliOutput(await handler(params), format);
		} finally {
			publisher?.endDynamicSession();
		}
	};

	for (const entry of COMMAND_REGISTRY) {
		const obsidianFlags = buildObsidianFlags(entry);

		plugin.registerCliHandler(
			entry.name,
			entry.description,
			obsidianFlags,
			async (data: ObsidianCliData) => {
				return handleCommand(entry.name, data);
			},
		);
	}

	return handlers;
}

/** Values Obsidian cannot distinguish from a bare boolean flag. */
function isFlagShaped(
	value: string | undefined,
): value is undefined | "" | "true" {
	return value === undefined || value === "" || value === "true";
}

/**
 * Reunite a key that still carries its own value.
 *
 * Obsidian splits `name=value` on the first `=` before handing the data over,
 * so this only fires if that ever stops being true. Splitting on the first
 * `=` rather than every `=` keeps `value=a=b` intact.
 */
function splitRawParam(
	rawKey: string,
	rawValue: string | undefined,
): [string, string | undefined] {
	const key = rawKey.trim();
	const value = rawValue?.trim();
	const separator = key.indexOf("=");

	if (separator <= 0 || !isFlagShaped(value)) {
		return [key, value];
	}

	const parsedKey = key.slice(0, separator).trim();
	const parsedValue = key.slice(separator + 1).trim();

	return parsedKey && parsedValue ? [parsedKey, parsedValue] : [key, value];
}

/**
 * Split Obsidian's flat CLI data into value-carrying arguments and boolean
 * flags.
 *
 * Obsidian types this data as `Record<string, string | 'true'>`: a bare flag
 * (`force`) and an explicit `value=true` both arrive as the string `"true"`,
 * so the payload alone cannot tell them apart. The command registry can — it
 * already declares which names take a value, and no name is both an argument
 * and a flag — so a declared argument keeps whatever it was given, including
 * `"true"` and the empty string.
 *
 * Without `meta` (an unregistered command) there is nothing to disambiguate
 * with, so flag-shaped values fall back to being flags.
 */
export function normalizeCliParams(
	rawParams: Record<string, string> | undefined,
	meta: CommandMeta | undefined,
): CliParams {
	const args: Record<string, string> = {};
	const flags = new Set<string>();

	if (!rawParams) {
		return { args, flags, verbose: false };
	}

	const valueTakingArgs = new Set(meta?.args.map((arg) => arg.name) ?? []);

	for (const [rawKey, rawValue] of Object.entries(rawParams)) {
		const [key, value] = splitRawParam(rawKey, rawValue);

		if (valueTakingArgs.has(key)) {
			args[key] = value ?? "";
			continue;
		}

		if (isFlagShaped(value)) {
			flags.add(key);
			continue;
		}

		args[key] = value;
	}

	return { args, flags, verbose: flags.has("verbose") };
}

function createBaseHandler(): CliHandler {
	return async () => {
		const lines = COMMAND_REGISTRY.map((command) => {
			return `${command.name} - ${command.description}`;
		});
		return {
			success: true,
			data: lines.join("\n"),
		};
	};
}

function buildObsidianFlags(meta: CommandMeta): ObsidianCliFlags | null {
	const flags: ObsidianCliFlags = {};
	let hasFlags = false;

	for (const arg of meta.args) {
		flags[arg.name] = {
			value: `<${arg.name}>`,
			description: arg.description,
			required: arg.required,
		};
		hasFlags = true;
	}

	for (const flag of meta.flags) {
		flags[flag.name] = {
			description: flag.description,
		};
		hasFlags = true;
	}

	return hasFlags ? flags : null;
}
