---
title: CLI
description: Automate Quartz Syncer workflows from the terminal using the Obsidian CLI.
created: 2026-04-01T00:00:00Z+0200
modified: 2026-06-08T15:22:53Z+0200
publish: true
tags: [guides]
---

Quartz Syncer supports the [Obsidian CLI](https://obsidian.md/cli) for automating publishing workflows from the terminal. This requires Obsidian v1.13 or later, and Obsidian must be running for CLI commands to work.

> [!NOTE] Obsidian must be running
>
> The Obsidian CLI is a remote control for the desktop app — it does not run headless. Obsidian will launch automatically if it is not already running when you execute a CLI command.

## Commands

### `quartz-syncer`

Show available commands and usage information.

```bash
obsidian quartz-syncer
obsidian quartz-syncer help
```

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
obsidian quartz-syncer:sync message="Weekly update"
obsidian quartz-syncer:sync dry-run format=json
```

| Flag | Description |
|------|-------------|
| `force` | Also delete removed notes from the remote repository. Without `force`, only the publish phase runs and skipped deletions are reported. |
| `message` | Custom commit message for the sync operation. |
| `dry-run` | Preview what would happen without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:publish`

Publish pending notes only, without deleting anything. This is the safest way to push new content.

```bash
obsidian quartz-syncer:publish
obsidian quartz-syncer:publish action=arbitrary force
obsidian quartz-syncer:publish message="New post"
obsidian quartz-syncer:publish dry-run format=json
```

| Flag | Description |
|------|-------------|
| `action` | `pending` (default) to publish marked notes, or `arbitrary` to publish all files in the vault. |
| `message` | Custom commit message for the publish operation. |
| `force` | **Required** for `action=arbitrary`. |
| `dry-run` | Preview what would be published without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:delete`

Delete removed notes from the remote repository without publishing anything new.

```bash
obsidian quartz-syncer:delete force
obsidian quartz-syncer:delete message="Cleanup"
obsidian quartz-syncer:delete dry-run format=json
```

| Flag | Description |
|------|-------------|
| `force` | **Required.** Confirms the deletion. Without `force`, the command returns an error. |
| `message` | Custom commit message for the deletion operation. |
| `dry-run` | Preview what would be deleted without making changes. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:mark`

Set, unset, or toggle the publish flag on notes.

```bash
obsidian quartz-syncer:mark path="notes/my-post.md"
obsidian quartz-syncer:mark path="notes/**/*.md" state=publish
obsidian quartz-syncer:mark path="~my post" toggle
obsidian quartz-syncer:mark path="blog/**/*.md" dry-run format=json
```

| Flag | Description |
|------|-------------|
| `path` | **Required.** The note path, glob pattern, or fuzzy query (see [[Guides/CLI#Path patterns|path patterns]] below). |
| `state` | `publish` (default), `unpublish`, `toggle`, or `unset`. |
| `toggle` | Toggle the publish state (alternative to `state=toggle`). |
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
obsidian quartz-syncer:cache action=clear-file path="notes/my-post.md"
obsidian quartz-syncer:cache action=clear
obsidian quartz-syncer:cache action=export
obsidian quartz-syncer:cache action=import data="..."
```

| Flag | Description |
|------|-------------|
| `action` | **Required.** `status`, `clear-file`, `clear` (clear all), `export`, `import`, `prune`, `tree-status`, or `tree-refresh`. |
| `path` | File path for `clear-file`. |
| `data` | Cache data for `import`. |
| `format` | Output format: `json` or `text` (default). |

### `quartz-syncer:config`

Read or write plugin settings from the CLI.

```bash
obsidian quartz-syncer:config action=list
obsidian quartz-syncer:config action=get key=git.branch
obsidian quartz-syncer:config action=set key=git.branch value=main
obsidian quartz-syncer:config action=reset force
```

| Flag | Description |
|------|-------------|
| `action` | (default: `list`) `list`, `get`, `set`, or `reset`. |
| `key` | Dot-notation setting key (e.g., `git.branch`, `useDataview`). Required for `get` and `set`. |
| `value` | New value for the setting. Required for `set`. |
| `force` | **Required** for `action=reset`. |
| `format` | Output format: `json` or `text` (default). |

> [!WARNING] Secret redaction
>
> The `git.auth.secret` field is always redacted in output and cannot be set via the CLI. Use the plugin settings UI to configure authentication tokens.

### `quartz-syncer:upgrade`

Pull upstream Quartz changes into your repository.

```bash
obsidian quartz-syncer:upgrade
obsidian quartz-syncer:upgrade dry-run format=json
```

| Flag | Description |
|------|-------------|
| `dry-run` | Check for available updates without applying them. |
| `format` | Output format: `json` or `text` (default). |

> [!INFO] Smart conflict resolution
>
> Quartz Syncer automatically resolves most upgrade conflicts. User files (`quartz.config.yaml`, `quartz.lock.json`, `quartz.ts`, `quartz/styles/custom.scss`, `content/`, `.github/`, `quartz/static/`, and `quartz/styles/syncer/`) are preserved, while framework files accept upstream changes.
>
> If you have modified framework files (e.g., `package.json`, files in `quartz/components/`), the upgrade will fail and list which files were modified. In that case, run `npx quartz upgrade` in your repository to resolve conflicts manually.

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
obsidian quartz-syncer:plugin action=add source="@jackyzha0/quartz"
obsidian quartz-syncer:plugin action=remove name="my-plugin"
obsidian quartz-syncer:plugin action=config name="my-plugin" set="key=value"
obsidian quartz-syncer:plugin action=search query="theme"
obsidian quartz-syncer:plugin action=install dry-run
```

| Flag | Description |
|------|-------------|
| `action` | `list` (default), `add`, `remove`, `install`, `enable`, `disable`, `config`, `prune`, or `search`. |
| `source` | Plugin source identifier (e.g., `@jackyzha0/quartz`). Required for `add`. |
| `name` | Plugin name. Required for `remove`, `config`, `enable`, and `disable`. |
| `set` | Configuration key-value pair (`key=value`) for `action=config`. |
| `query` | Search query for `action=search`. |
| `dry-run` | Preview changes without applying them. |
| `format` | Output format: `json` or `text` (default). |
| `verbose` | Show source keys, plugin options, and commit SHAs. |

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

### `quartz-syncer:quartz-build`

Run Quartz build.

> [!NOTE] Desktop only
>
> This command requires a local Quartz repository and is only available on desktop.

```bash
obsidian quartz-syncer:quartz-build
```

| Flag | Description |
|------|-------------|
| `help` | Show command-specific help. |

### `quartz-syncer:quartz-serve`

Run Quartz dev server.

> [!NOTE] Desktop only
>
> This command requires a local Quartz repository and is only available on desktop.

```bash
obsidian quartz-syncer:quartz-serve
obsidian quartz-syncer:quartz-serve port=8081
```

| Flag | Description |
|------|-------------|
| `port` | Port number to serve on. |
| `help` | Show command-specific help. |

### `quartz-syncer:quartz-sync`

Run Quartz git sync (pull/push/commit).

> [!NOTE] Desktop only
>
> This command requires a local Quartz repository and is only available on desktop.

```bash
obsidian quartz-syncer:quartz-sync
obsidian quartz-syncer:quartz-sync pull=false
obsidian quartz-syncer:quartz-sync message="Manual sync"
```

| Flag | Description |
|------|-------------|
| `commit` | Whether to commit changes (`true`/`false`). |
| `push` | Whether to push changes (`true`/`false`). |
| `pull` | Whether to pull changes (`true`/`false`). |
| `message` | Custom commit message. |
| `help` | Show command-specific help. |

### `quartz-syncer:quartz-restore`

Restore Quartz content from cache.

> [!NOTE] Desktop only
>
> This command requires a local Quartz repository and is only available on desktop.

```bash
obsidian quartz-syncer:quartz-restore force
```

| Flag | Description |
|------|-------------|
| `force` | **Required.** Confirms the restoration. |
| `help` | Show command-specific help. |

### `quartz-syncer:repo`

Manage repository connection.

```bash
obsidian quartz-syncer:repo action=info
obsidian quartz-syncer:repo action=set-local path=/path/to/quartz
obsidian quartz-syncer:repo action=verify path=/path/to/quartz
```

| Flag | Description |
|------|-------------|
| `action` | `info`, `set-local`, `set-remote`, or `verify`. |
| `path` | Path for `set-local` or `verify`. |
| `format` | Output format: `json` or `text` (default). |
| `help` | Show command-specific help. |

### `quartz-syncer:media`

Manage media files.

```bash
obsidian quartz-syncer:media action=orphaned
obsidian quartz-syncer:media action=clean force
```

| Flag | Description |
|------|-------------|
| `action` | `list`, `orphaned`, or `clean`. |
| `force` | **Required** for `action=clean`. |
| `dry-run` | Preview changes without applying them. |
| `format` | Output format: `json` or `text` (default). |
| `help` | Show command-specific help. |

### `quartz-syncer:diff`

Show compiled diff between vault and repo.

```bash
obsidian quartz-syncer:diff
obsidian quartz-syncer:diff path=notes/post.md
```

| Flag | Description |
|------|-------------|
| `path` | Specific file path to diff. |
| `format` | Output format: `json` or `text` (default). |
| `help` | Show command-specific help. |

### `quartz-syncer:validate`

Validate Quartz repo state.

```bash
obsidian quartz-syncer:validate
```

| Flag | Description |
|------|-------------|
| `format` | Output format: `json` or `text` (default). |
| `help` | Show command-specific help. |

### `quartz-syncer:inspect`

Inspect internal state.

```bash
obsidian quartz-syncer:inspect target=hashes
obsidian quartz-syncer:inspect target=queue
obsidian quartz-syncer:inspect target=cache path=notes/post.md
```

| Flag | Description |
|------|-------------|
| `target` | `cache`, `hashes`, `compilation`, `queue`, or `all`. |
| `path` | Specific file path to inspect. |
| `format` | Output format: `json` or `text` (default). |
| `help` | Show command-specific help. |

## Flags

### Global flags (all commands)

- `format=json` — Returns structured JSON output, useful for scripts and CI pipelines.
- `format=text` — Returns human-readable text (default).
- `verbose` (or `v`) — Enable detailed output (file paths, connection details, commit SHAs).
- `help` (or `h`) — Show command-specific help and available flags.

### Command-specific flags

- `dry-run` — Preview what would happen without making changes. Supported by `sync`, `publish`, `delete`, `mark`, `upgrade`, `plugin`, and `media`.
- `force` — Required for destructive operations. Supported by `sync` (delete phase), `publish` (arbitrary action), `delete`, `config` (reset action), `media` (clean action), and `quartz-restore`.

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
obsidian quartz-syncer:mark path="blog/**/*.md" state=publish

# Publish them
obsidian quartz-syncer:publish
```

### Quartz management

```bash
# Run a local Quartz build
obsidian quartz-syncer:quartz-build

# Start the local preview server
obsidian quartz-syncer:quartz-serve port=8080
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
