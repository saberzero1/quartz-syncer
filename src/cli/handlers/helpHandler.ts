import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess } from "../formatOutput";

const COMMAND = "quartz-syncer";

const FLAGS: CliFlags = {
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

const HELP_TEXT = `Quartz Syncer CLI — Manage and publish notes to Quartz from the terminal.

Usage: obsidian quartz-syncer[:<command>] [flags]

Commands:
  status         Show the publish status of all marked notes
  sync           Publish pending notes and optionally delete removed notes
  publish        Publish pending notes without deletions
  delete         Delete removed notes from the remote repository
  mark           Set or toggle the publish flag for matching files
  test           Test repository connection and credentials
  cache          Manage the Quartz Syncer cache
  config         Read or update Quartz Syncer settings
  upgrade        Upgrade the Quartz repository from upstream
  version        Show plugin, Obsidian, and Quartz version information
  plugin         Manage Quartz v5 plugins
  quartz-config  Read or update Quartz v5 site configuration

Global flags (all commands):
  format=<json|text>   Output format (default: text)
  help, h              Show command-specific help
  verbose, v           Enable detailed output

Command-specific flags:
  dry-run              Preview changes (sync, publish, delete, mark, upgrade)
  force                Required for destructive operations (sync, delete, upgrade, plugin)

Examples:
  obsidian quartz-syncer:status
  obsidian quartz-syncer:status format=json
  obsidian quartz-syncer:sync force
  obsidian quartz-syncer:publish dry-run
  obsidian quartz-syncer:mark path="notes/post.md"
  obsidian quartz-syncer:mark path="blog/**/*.md" dry-run
  obsidian quartz-syncer:config action=get key=git.branch

Documentation: https://saberzero1.github.io/quartz-syncer-docs/`;

export function createHelpHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Show available commands and usage information",
		FLAGS,
		(params: CliData): string => {
			if (params.format === "json") {
				return formatCliOutput(
					params,
					cliSuccess(COMMAND, HELP_TEXT, {
						commands: [
							{
								name: "quartz-syncer:status",
								description:
									"Show the publish status of all marked notes",
							},
							{
								name: "quartz-syncer:sync",
								description:
									"Publish pending notes and optionally delete removed notes",
							},
							{
								name: "quartz-syncer:publish",
								description:
									"Publish pending notes without deletions",
							},
							{
								name: "quartz-syncer:delete",
								description:
									"Delete removed notes from the remote repository",
							},
							{
								name: "quartz-syncer:mark",
								description:
									"Set or toggle the publish flag for matching files",
							},
							{
								name: "quartz-syncer:test",
								description:
									"Test repository connection and credentials",
							},
							{
								name: "quartz-syncer:cache",
								description: "Manage the Quartz Syncer cache",
							},
							{
								name: "quartz-syncer:config",
								description:
									"Read or update Quartz Syncer settings",
							},
							{
								name: "quartz-syncer:upgrade",
								description:
									"Upgrade the Quartz repository from upstream",
							},
							{
								name: "quartz-syncer:version",
								description:
									"Show plugin, Obsidian, and Quartz version information",
							},
							{
								name: "quartz-syncer:plugin",
								description: "Manage Quartz v5 plugins",
							},
							{
								name: "quartz-syncer:quartz-config",
								description:
									"Read or update Quartz v5 site configuration",
							},
						],
						version: plugin.appVersion,
					}),
				);
			}

			return HELP_TEXT;
		},
	);
}
