# Quartz Syncer

Quartz Syncer is an [Obsidian](https://obsidian.md/) plugin for managing and publishing notes to [Quartz](https://quartz.jzhao.xyz/), the fast, batteries-included static-site generator that transforms Markdown content into fully functional websites.

## Features

- **Multi-provider support**: Works with GitHub, GitLab, Bitbucket, Codeberg, Gitea, and self-hosted Git instances.
- **Plugin integrations**: Compiles [Dataview](https://blacksmithgu.github.io/obsidian-dataview/), [Datacore](https://blacksmithgu.github.io/datacore/), and [Fantasy Statblocks](https://plugins.javalent.com/statblocks) queries into static content.
- **Smart caching**: Caches compiled files for faster subsequent publishes. Dynamic content (Dataview/Datacore queries) is automatically detected and recompiled when needed.
- **Diff viewer**: Preview exact changes before publishing with split (side-by-side) or unified view.
- **Selective publishing**: Choose exactly which notes to publish, update, or remove.
- **CLI support**: Automate publishing workflows from the terminal via the [Obsidian CLI](https://obsidian.md/cli) (requires Obsidian v1.12+).

## Installation

Install the plugin by downloading it from the Obsidian Community plugins browser in Obsidian.

Alternatively, install the plugin by downloading it from the [Release Tab](https://github.com/saberzero1/quartz-syncer/releases), or through the [Obsidian42 Brat plugin](https://github.com/TfTHacker/obsidian42-brat).

## Setup

> [!TIP]
> **Quartz Syncer documentation**
>
> For the most up-to-date information on Quartz Syncer, please refer to the [official documentation](https://saberzero1.github.io/quartz-syncer-docs/).

New to Quartz Syncer? Please follow the [setup guide](https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide) to get started.

## Usage

Unsure on how to use Quartz Syncer, or just curious about its usage? Check the [usage guide](https://saberzero1.github.io/quartz-syncer-docs/Usage-Guide).

## Advanced usage

For more advanced usages of Quartz Syncer, check the [guides section](https://saberzero1.github.io/quartz-syncer-docs/Guides/).

## CLI

Quartz Syncer supports the [Obsidian CLI](https://obsidian.md/cli) (v1.12+) for automating publishing workflows from the terminal. Obsidian must be running for CLI commands to work.

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `quartz-syncer` | Show available commands and usage | `obsidian quartz-syncer` |
| `quartz-syncer:status` | Show publish status of all marked notes | `obsidian quartz-syncer:status format=json` |
| `quartz-syncer:sync` | Publish pending notes and delete removed notes | `obsidian quartz-syncer:sync force` |
| `quartz-syncer:publish` | Publish pending notes only (no deletions) | `obsidian quartz-syncer:publish` |
| `quartz-syncer:delete` | Delete removed notes from remote | `obsidian quartz-syncer:delete force` |
| `quartz-syncer:mark` | Set/unset/toggle publish flag on notes | `obsidian quartz-syncer:mark path="notes/post.md"` |
| `quartz-syncer:test` | Test Git connection and credentials | `obsidian quartz-syncer:test` |
| `quartz-syncer:cache` | Manage the plugin cache | `obsidian quartz-syncer:cache action=status` |
| `quartz-syncer:config` | Read or write plugin settings | `obsidian quartz-syncer:config action=get key=git.branch` |
| `quartz-syncer:upgrade` | Pull upstream Quartz changes | `obsidian quartz-syncer:upgrade force` |
| `quartz-syncer:version` | Show plugin, Obsidian, and Quartz versions | `obsidian quartz-syncer:version` |
| `quartz-syncer:plugin` | Manage Quartz v5 plugins | `obsidian quartz-syncer:plugin action=updates` |
| `quartz-syncer:quartz-config` | Read or update Quartz v5 site config | `obsidian quartz-syncer:quartz-config action=get key=pageTitle` |

The `config` and `quartz-config` commands default to listing all settings when no action is provided.

### Common flags

- `format=json` — Return machine-readable JSON output (default: human-readable text).
- `dry-run` — Preview what would happen without making changes.
- `force` — Required for destructive operations (`delete`, `upgrade`, and the delete phase of `sync`).
- `verbose` — Enable detailed output (file paths, connection details).
- `help` — Show command-specific help and available flags.

### Path patterns

The `mark` command supports three path resolution modes:

- **Exact**: `path="notes/my-post.md"` — Match a single file.
- **Glob**: `path="notes/**/*.md"` — Match files using glob patterns.
- **Fuzzy**: `path="~my post"` — Fuzzy search by name (prefix with `~`).

Use `dry-run` to preview matched files before modifying: `obsidian quartz-syncer:mark path="blog/**/*.md" dry-run`

### Example workflow

```bash
# Check what needs publishing
obsidian quartz-syncer:status

# Publish all pending notes (additive, no force needed)
obsidian quartz-syncer:publish

# Full sync including deletions
obsidian quartz-syncer:sync force
```

## Troubleshooting

> [!IMPORTANT]
> **Quartz-related questions**
>
> For issues or questions related to Quartz, not Quartz Syncer, please consult the [Quartz documentation](https://quartz.jzhao.xyz/) or reach out through the communication channels provided there.

If you need help with Quartz Syncer, or if you have a question, please first check the [troubleshooting section](https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/). If your question or issue is not listed, feel free to [reach out for help](https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/#i-have-a-different-issue-not-listed-here).

## Disclosures

As per the [Obsidian developer policies](https://docs.obsidian.md/Developer+policies#Disclosures):

- **Account requirements**: Quartz Syncer needs to access your Quartz repository on a Git provider in order to publish your notes. An account on your chosen Git provider (GitHub, GitLab, Bitbucket, etc.) is required.
- **Network use**: Quartz Syncer accesses the network to manage and publish your notes to your Quartz repository. Quartz Syncer uses Git over HTTPS to communicate with your repository.
- **Accessing files outside of Obsidian vaults**: Quartz Syncer only manages explicitly marked *and* user-selected notes in your Quartz repository `content` folder. Quartz Syncer also fetches the current contents of this folder to compare changes against your notes. Quartz Syncer doesn't write any notes to your Obsidian vault, Quartz Syncer only writes to your Quartz repository (one-way only: from Obsidian vault to Quartz repository.)

## Acknowledgements

Quartz Syncer would not have been built without the following:

- [Obsidian Digital Garden](https://dg-docs.ole.dev/), on top of which most of this plugin was initially built.
- [Quartz](https://quartz.jzhao.xyz/), for the amazing and welcoming community. Come say hi in the Discord server sometimes.
- [Isomorphic-git](https://isomorphic-git.org/), for enabling Git operations directly in JavaScript.
- [Obsidian Linter](https://github.com/platers/obsidian-linter), for inspiring the tabbed settings UI.
- [Dataview](https://blacksmithgu.github.io/obsidian-dataview/), for their great API integration, allowing me to properly integrate it in Quartz.
- [Datacore](https://blacksmithgu.github.io/datacore/), for their wonderful integration despite its infancy, allowing easy integration into Quartz.
- [Fantasy Statblocks](https://plugins.javalent.com/statblocks), for their extensible functionality and easy-to-integrate API.
- [Obsidian Publish](https://obsidian.md/publish), for inspiring me to create a similar solution for Quartz.
- The entire Obsidian community, for all your weird and amazing creations. Keep it up.
