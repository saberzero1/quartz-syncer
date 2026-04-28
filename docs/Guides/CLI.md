---
title: CLI
description: Automate Quartz Syncer workflows from the terminal using the Obsidian CLI.
created: 2026-04-01T00:00:00Z+0200
modified: 2026-04-01T17:15:10Z+0200
publish: true
tags: [guides]
---

Quartz Syncer supports the [Obsidian CLI](https://obsidian.md/cli) for automating publishing workflows from the terminal. This requires Obsidian v1.12 or later, and Obsidian must be running for CLI commands to work.

> [!NOTE] Obsidian must be running
>
> The Obsidian CLI is a remote control for the desktop app — it does not run headless. Obsidian will launch automatically if it is not already running when you execute a CLI command.

## Commands

### `quartz-syncer:status`

Show the publish status of all marked notes.

```bash
obsidian quartz-syncer:status
obsidian quartz-syncer:status format=json
```

Returns counts and file lists for unpublished, changed, published, and deleted notes. Use `format=json` for machine-readable output.

### `quartz-syncer:sync`

Full sync — publish all pending notes and delete removed notes in one operation.

```bash
obsidian quartz-syncer:sync
obsidian quartz-syncer:sync force
obsidian quartz-syncer:sync dry-run format=json
```

| Flag | Description |
|------|-------------|
| `force` | Also delete removed notes from the remote repository. Without `force`, only the publish phase runs and skipped deletions are reported. |
| `dry-run` | Preview what would happen without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:publish`

Publish pending notes only, without deleting anything. This is the safest way to push new content.

```bash
obsidian quartz-syncer:publish
obsidian quartz-syncer:publish dry-run format=json
```

| Flag | Description |
|------|-------------|
| `dry-run` | Preview what would be published without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:delete`

Delete removed notes from the remote repository without publishing anything new.

```bash
obsidian quartz-syncer:delete force
obsidian quartz-syncer:delete dry-run format=json
```

| Flag | Description |
|------|-------------|
| `force` | **Required.** Confirms the deletion. Without `force`, the command returns an error. |
| `dry-run` | Preview what would be deleted without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:mark`

Set, unset, or toggle the publish flag on notes.

```bash
obsidian quartz-syncer:mark path="notes/my-post.md"
obsidian quartz-syncer:mark path="notes/**/*.md" value=true
obsidian quartz-syncer:mark path="~my post" value=toggle
obsidian quartz-syncer:mark path="blog/**/*.md" dry-run format=json
```

| Flag | Description |
|------|-------------|
| `path` | **Required.** The note path, glob pattern, or fuzzy query (see [[Guides/CLI#Path patterns|path patterns]] below). |
| `value` | `true` (default), `false`, or `toggle`. |
| `dry-run` | Show matched files without modifying them. Useful with glob and fuzzy patterns. |
| `format` | Output format: `json` or `text` (default). |

#### Path patterns

The `path` flag supports three resolution modes:

- **Exact match**: `path="notes/my-post.md"` — Matches a single file by its vault-relative path.
- **Glob match**: `path="notes/**/*.md"` — Matches files using glob patterns. Detected when the path contains `*` or `?`.
- **Fuzzy match**: `path="~my post"` — Fuzzy-searches file names. Detected when the path starts with `~`.

> [!TIP] Preview before modifying
>
> When using glob or fuzzy patterns, use `dry-run` first to see which files would be affected:
> ```bash
> obsidian quartz-syncer:mark path="blog/**/*.md" dry-run
> ```

### `quartz-syncer:test`

Test the Git connection to validate your credentials and repository access.

```bash
obsidian quartz-syncer:test
obsidian quartz-syncer:test format=json
```

Returns whether the connection succeeded, whether you have write access, and the repository name and branch.

### `quartz-syncer:cache`

Manage the plugin cache.

```bash
obsidian quartz-syncer:cache action=status
obsidian quartz-syncer:cache action=clear path="notes/my-post.md"
obsidian quartz-syncer:cache action=clear-all force
```

| Flag | Description |
|------|-------------|
| `action` | **Required.** `status` (show cache info), `clear` (clear cache for a specific file), or `clear-all` (clear all cached data). |
| `path` | File path for `action=clear`. |
| `force` | Required for `action=clear-all`. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:config`

Read or write plugin settings from the CLI.

```bash
obsidian quartz-syncer:config action=list
obsidian quartz-syncer:config action=get key=git.branch
obsidian quartz-syncer:config action=set key=git.branch value=main
```

| Flag | Description |
|------|-------------|
| `action` | (default: `list`) `list` (show all settings), `get` (read a setting), or `set` (write a setting). |
| `key` | Dot-notation setting key (e.g., `git.branch`, `useDataview`). Required for `get` and `set`. |
| `value` | New value for the setting. Required for `set`. |
| `format` | Output format: `json` or `text` (default). |

> [!WARNING] Secret redaction
>
> The `git.auth.secret` field is always redacted in output and cannot be set via the CLI. Use the plugin settings UI to configure authentication tokens.

### `quartz-syncer:upgrade`

Pull upstream Quartz changes into your repository.

```bash
obsidian quartz-syncer:upgrade force
obsidian quartz-syncer:upgrade dry-run format=json
```

| Flag | Description |
|------|-------------|
| `force` | **Required.** Confirms the upgrade. Without `force`, the command returns an error. |
| `dry-run` | Check for available updates without applying them. |
| `format` | Output format: `json` or `text` (default). |

> [!WARNING] Merge conflicts
>
> If the upgrade encounters merge conflicts (other than `quartz.lock.json`, which is auto-resolved), the command will fail and list the conflicting files. Resolve them manually in your repository.

### `quartz-syncer:version`

Show plugin, Obsidian, and Quartz version information.

```bash
obsidian quartz-syncer:version
obsidian quartz-syncer:version format=json
```

| Flag | Description |
|------|-------------|
| `format` | Output format: `json` or `text` (default). |
| `verbose` | Include repository name, branch, and config file details. |

### `quartz-syncer:plugin`

Manage Quartz v5 plugins — list installed plugins, add or remove plugins, check for updates, and browse the community registry.

```bash
obsidian quartz-syncer:plugin
obsidian quartz-syncer:plugin action=add source="github:org/repo"
obsidian quartz-syncer:plugin action=remove source="github:org/repo" force
obsidian quartz-syncer:plugin action=updates
obsidian quartz-syncer:plugin action=update force
obsidian quartz-syncer:plugin action=browse
```

| Flag | Description |
|------|-------------|
| `action` | `list` (default), `add`, `remove`, `updates`, `update`, or `browse`. |
| `source` | Plugin source identifier (e.g., `github:org/repo`). Required for `add` and `remove`. |
| `force` | Required for `remove` and `update`. |
| `format` | Output format: `json` or `text` (default). |
| `verbose` | Show source keys, plugin options, and commit SHAs. |

- `updates` shows only plugins with available updates (use `verbose` to see all).
- `update` with `force` applies all pending plugin updates to the lock file.

### `quartz-syncer:quartz-config`

Read or update the Quartz v5 site configuration (pageTitle, theme, locale, etc.).

```bash
obsidian quartz-syncer:quartz-config
obsidian quartz-syncer:quartz-config action=get key=pageTitle
obsidian quartz-syncer:quartz-config action=set key=pageTitle value="My Site"
obsidian quartz-syncer:quartz-config action=set key=theme.typography.header value="Inter"
```

| Flag | Description |
|------|-------------|
| `action` | `list` (default), `get`, or `set`. |
| `key` | Dot-notation config key (e.g., `pageTitle`, `theme.typography.header`, `theme.colors.lightMode.secondary`). Required for `get` and `set`. |
| `value` | New value. Required for `set`. |
| `format` | Output format: `json` or `text` (default). |

Values are validated against the Quartz v5 schema. Boolean keys (`enableSPA`, `enablePopovers`, `theme.cdnCaching`) accept `true` or `false`. The `theme.fontOrigin` key only accepts `googleFonts` or `local`.

Note: `ignorePatterns` and `analytics` cannot be set via CLI due to their complex structure. Use the plugin settings UI for these.

## Flags

### Global flags (all commands)

- `format=json` — Returns structured JSON output, useful for scripts and CI pipelines.
- `format=text` — Returns human-readable text (default).
- `verbose` (or `v`) — Enable detailed output (file paths, connection details, commit SHAs).
- `help` (or `h`) — Show command-specific help and available flags.

### Command-specific flags

- `dry-run` — Preview what would happen without making changes. Supported by `sync`, `publish`, `delete`, `mark`, and `upgrade`.
- `force` — Required for destructive operations. Supported by `sync` (delete phase), `delete`, `upgrade`, and `plugin` (remove/update).

Long-running commands include timing information in the output (e.g., `Published 47 files. (23.4s)`).

## Example workflows

### Basic publish

```bash
# Check what needs publishing
obsidian quartz-syncer:status

# Publish all pending notes
obsidian quartz-syncer:publish
```

### Full sync with deletions

```bash
# Preview all changes
obsidian quartz-syncer:sync dry-run

# Apply all changes including deletions
obsidian quartz-syncer:sync force
```

### Batch mark and publish

```bash
# Mark all notes in a folder for publishing
obsidian quartz-syncer:mark path="blog/**/*.md" value=true

# Publish them
obsidian quartz-syncer:publish
```

### Scripting with JSON output

The `format=json` flag makes it easy to integrate Quartz Syncer into local shell scripts:

```bash
# Use JSON output for scripting
STATUS=$(obsidian quartz-syncer:status format=json)

# Sync and capture result
RESULT=$(obsidian quartz-syncer:sync force format=json)
```

> [!NOTE] Local only
> The Obsidian CLI controls the running Obsidian desktop app — it is not a headless tool. These scripting examples are meant for local automation (e.g., shell aliases, cron jobs on your machine), not for headless CI/CD environments.
