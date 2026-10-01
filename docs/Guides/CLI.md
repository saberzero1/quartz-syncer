---
title: CLI
description: Automate Quartz Syncer workflows from the terminal using the Obsidian CLI.
created: 2026-04-01T00:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

Quartz Syncer registers 22 commands with the [Obsidian CLI](https://obsidian.md/cli) for automating publishing workflows from the terminal. This requires Obsidian v1.13 or later, and Obsidian must be running.

> [!NOTE] Obsidian must be running
>
> The Obsidian CLI is a remote control for the desktop app — it does not run headless. Obsidian will launch automatically if it is not already running when you execute a CLI command.

## Arguments and flags

Every command takes two kinds of parameter:

- **Arguments** carry a value: `path=notes/post.md`, `format=json`, `port=8081`.
- **Flags** are booleans and are written bare: `force`, `dry-run`, `verbose`.

Each command declares which of its parameter names are value-taking and which are boolean, so a value that happens to look like a flag is still read as a value. `state=true` is a value; `force` is a flag.

> [!IMPORTANT] `force=false` does not arm a destructive command
>
> Destructive commands need `force` present as a flag. Writing `force=false` leaves them disarmed rather than enabling them, which is deliberate — it means a scripted `force=$SHOULD_FORCE` cannot accidentally delete anything when the variable is `false`.

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

Returns counts for unpublished, changed, published, and deleted notes:

```json
{ "unpublished": 3, "changed": 1, "published": 42, "deleted": 0 }
```

With `verbose`, each category becomes `{ count, files }`. Note entries carry `path`, `publishFlag` and `hasMedia`; deleted entries are repository paths.

Status is computed against whichever [[Publish to|destination]] is currently selected.

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

| Parameter | Description |
|------|-------------|
| `action` | Omit to publish pending notes. `arbitrary` publishes the [[Allow custom file publishing\|custom files]] you configured. |
| `message` | Custom commit message. Defaults to `Published via Quartz Syncer CLI`, or `Published arbitrary files via Quartz Syncer CLI` for `action=arbitrary`. |
| `force` | **Required** for `action=arbitrary`. |
| `dry-run` | Preview what would be published without making changes. |
| `verbose` | Include the published paths in the output. |
| `format` | Output format: `json` or `text` (default). |

> [!WARNING] `action=arbitrary` does not publish your vault
>
> It publishes the specific files added under **Custom files** in the Publication Center's [[Usage Guide#Advanced tab|Advanced tab]], and requires [[Allow custom file publishing]] to be enabled. It is blocked on Quartz v4 repositories.

Media linked by the notes being published is included automatically.

### `quartz-syncer:delete`

Delete notes that were removed from your vault, or explicitly unpublish notes that still exist.

```bash
obsidian quartz-syncer:delete force
obsidian quartz-syncer:delete dry-run force format=json
obsidian quartz-syncer:delete action=unpublish path="notes/post.md" force
```

| Parameter | Description |
|------|-------------|
| `force` | **Required**, always — including with `dry-run`. Without it the command returns an error. |
| `action` | Omit to delete notes removed from the vault. `unpublish` removes notes that still exist in the vault. |
| `path` | **Required** for `action=unpublish`. Exact path, glob, or `~fuzzy` query. See [[#Path patterns]]. |
| `message` | Custom commit message. Defaults to `Deleted via Quartz Syncer CLI`, or `Unpublished via Quartz Syncer CLI`. |
| `dry-run` | List what would be deleted without deleting it. |
| `verbose` | Include the deleted paths in the output. |
| `format` | Output format: `json` or `text` (default). |

> [!NOTE] `path` requires `action=unpublish`
>
> Supplying `path` without `action=unpublish` is rejected rather than silently falling back to bulk deletion.

See [[#Unpublishing notes]] for the full unpublish contract.

### `quartz-syncer:mark`

Set, unset, or toggle the publish flag on notes.

```bash
obsidian quartz-syncer:mark path="notes/my-post.md"
obsidian quartz-syncer:mark path="notes/**/*.md" state=publish
obsidian quartz-syncer:mark path="~my post" toggle
obsidian quartz-syncer:mark path="blog/**/*.md" dry-run format=json
```

| Parameter | Description |
|------|-------------|
| `path` | **Required.** The note path, glob pattern, or fuzzy query (see [[Guides/CLI#Path patterns\|path patterns]] below). |
| `state` | What to set the publish property to. See the table below. **Defaults to toggling.** |
| `toggle` | Toggle the publish state. Equivalent to `state=toggle`. |
| `dry-run` | Show matched files without modifying them. Useful with glob and fuzzy patterns. |
| `format` | Output format: `json` or `text` (default). |

> [!IMPORTANT] Omitting `state` toggles
>
> With neither `state` nor `toggle` given, `mark` **toggles** the publish property. To set it explicitly, always pass `state`.

Accepted `state` values:

| Intent | Values |
| --- | --- |
| Set to `true` | `true`, `on`, `yes`, `1`, `set`, `publish` |
| Set to `false` | `false`, `off`, `no`, `0`, `unpublish` |
| Remove the property entirely | `unset`, `remove`, `clear` |
| Toggle | `toggle` |

> [!NOTE] `state=unpublish` is not unpublishing
>
> It sets the note's publish property to `false`, which removes the note from the Publication Center. It does **not** remove anything already published. For that, use [[#Unpublishing notes|`delete action=unpublish`]].

Output is `{ matched, matchedCount }` for a dry run, plus `modified` when it actually writes.

#### Path patterns

The `path` argument supports three resolution modes:

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
obsidian quartz-syncer:test verbose
obsidian quartz-syncer:test format=json
```

Tests **the destination publishing actually uses**, not necessarily the remote:

| Destination | What is tested | Output |
| --- | --- | --- |
| Remote | Reachability, credentials, write access | `{ mode: "remote", ... }`. With `verbose`: `url`, `branch`, `authType`, `provider`. |
| Local | That the path exists, is a directory, and holds a Quartz installation | `{ mode: "local", path, quartzVersion, checks }`. With `verbose`: `contentFolder`. |

Each entry in `checks` is `{ check, passed, detail? }`. See [[Publish to]] for how the destination is chosen.

### `quartz-syncer:cache`

Manage the plugin cache.

```bash
obsidian quartz-syncer:cache action=status
obsidian quartz-syncer:cache action=clear-file path="notes/my-post.md"
obsidian quartz-syncer:cache action=clear
obsidian quartz-syncer:cache action=export
obsidian quartz-syncer:cache action=import data="..."
obsidian quartz-syncer:cache action=prune-foreign force dry-run
obsidian quartz-syncer:cache action=prune-foreign force
```

| Parameter | Description |
|------|-------------|
| `action` | `status` (default), `clear-file`, `clear`, `export`, `import`, `prune`, `prune-foreign`, `tree-status`, or `tree-refresh`. |
| `path` | File path for `clear-file`. |
| `data` | Cache data for `import`. |
| `force` | **Required** for `prune-foreign`, including with `dry-run`. |
| `dry-run` | Survey `prune-foreign` candidates without deleting them; returns their exact database names. |
| `format` | Output format: `json` or `text` (default). |

| Action | Output |
| --- | --- |
| `status` | `{ entries, sizeEstimateBytes }` |
| `clear` | `{ cleared: true }` |
| `clear-file` | `{ cleared: path }` |
| `export` | `{ entries, cache }` |
| `import` | `{ imported }` |
| `prune` | `{ pruned: true }` |
| `prune-foreign` | `{ dropped, failed, count }`, or `{ names }` with `dry-run` |
| `tree-status` | `{ cached, entries }` |
| `tree-refresh` | `{ refreshed: true, entries }` |

`prune` keeps the automatic sweep's conservative scope and needs no confirmation. `prune-foreign` also reclaims caches from other vaults and remotes you no longer publish to, while protecting this vault's current caches and configured remote clone.

These databases contain only rebuildable cached data, never notes. Other vaults still in use rebuild their caches automatically next time they open. To review and confirm an exact list in the UI, use [[Clean up caches from other vaults|Performance → Clean up caches from other vaults]].

### `quartz-syncer:config`

Read or write plugin settings from the CLI.

```bash
obsidian quartz-syncer:config action=list
obsidian quartz-syncer:config action=get key=gitBranch
obsidian quartz-syncer:config action=set key=gitBranch value=main
obsidian quartz-syncer:config action=set key=publishTarget value=local
obsidian quartz-syncer:config action=reset force
```

| Parameter | Description |
|------|-------------|
| `action` | `list` (default), `get`, `set`, or `reset`. |
| `key` | Setting key. Required for `get` and `set`. |
| `value` | New value. Required for `set`. Parsed as JSON where applicable, so booleans, numbers, `null`, arrays and objects work. |
| `force` | **Required** for `action=reset`. |
| `format` | Output format: `json` or `text` (default). |

> [!IMPORTANT] Setting keys are flat, not nested
>
> Use `gitBranch`, `gitRemoteUrl`, `vaultPath`, `publishTarget`, `useDataview`, `enableSystemCommands` and so on. Quartz Syncer v1 stored Git settings in a nested `git` object, so older examples show `git.branch` — that shape no longer exists and `key=git.branch` will not resolve. Run `action=list` to see every current key.

`reset` restores defaults but preserves your connection and version keys, so it does not disconnect you from your repository. It reports `{ reset: true, changed }`.

> [!WARNING] A mistyped key is created, not rejected
>
> `action=set` does not check that the key exists. An unrecognised name is written as a new setting rather than returning an error. Verify with `action=get` afterwards.

> [!NOTE] Your access token is not a setting
>
> The token is held in Obsidian's secret storage, not in the settings record, so `action=list` cannot expose it and there is no key to set it through. Use the [[Access token|plugin settings]] or [[Setup Guide#Manual setup|manual setup]].

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

| Parameter | Description |
|------|-------------|
| `action` | `list` (default), `add`, `remove`, `install`, `enable`, `disable`, `config`, `prune`, or `search`. |
| `source` | Plugin source identifier. Required for `add`; optional for `install`. |
| `name` | Plugin name. Required for `remove`, `config`, `enable` and `disable`. Comma-separated for `enable` and `disable`. |
| `set` | Configuration key-value pair (`key=value`) for `action=config`. |
| `query` | Search query for `action=search`. |
| `dry-run` | Preview changes without applying them. |
| `format` | Output format: `json` or `text` (default). |
| `verbose` | Show source keys, plugin options, and commit SHAs. |

> [!NOTE] Requires Quartz v5 and a local checkout
>
> Plugin management runs the Quartz CLI against your [[Local Quartz repo path|local repository]], so it needs [[Enable system commands]] on and a Quartz v5 repository. See [[Setup Guide#Quartz v4 and v5]].

`search` returns `{ count, plugins }`, plus `query` when one was given. The [[Guides/Quartz Hub#Plugins tab|Quartz Hub]] offers the same functionality with a UI.

### `quartz-syncer:quartz-config`

Read or update the Quartz v5 site configuration (pageTitle, theme, locale, etc.).

```bash
obsidian quartz-syncer:quartz-config
obsidian quartz-syncer:quartz-config action=get key=configuration.pageTitle
obsidian quartz-syncer:quartz-config action=set key=configuration.pageTitle value="My Site"
obsidian quartz-syncer:quartz-config action=set key=configuration.theme.typography.header value="Inter"
```

| Parameter | Description |
|------|-------------|
| `action` | `list` (default), `get`, or `set`. |
| `key` | Dotted path from the root of `quartz.config.yaml`. Required for `get` and `set`. |
| `value` | New value. Required for `set`. Parsed as JSON when it looks like JSON, so arrays, objects, booleans and numbers work. |
| `format` | Output format: `json` or `text` (default). |

> [!IMPORTANT] Keys are rooted at the config file, so site options need the `configuration.` prefix
>
> `quartz.config.yaml` has three top-level keys — `configuration`, `plugins` and `layout` — and `key` is a path from that root. Site options live under `configuration`:
>
> | Option | Key |
> | --- | --- |
> | Page title | `configuration.pageTitle` |
> | Base URL | `configuration.baseUrl` |
> | Locale | `configuration.locale` |
> | SPA mode | `configuration.enableSPA` |
> | Popovers | `configuration.enablePopovers` |
> | Header font | `configuration.theme.typography.header` |
> | Font origin | `configuration.theme.fontOrigin` |
> | CDN caching | `configuration.theme.cdnCaching` |
> | Light-mode secondary colour | `configuration.theme.colors.lightMode.secondary` |
>
> A bare `key=pageTitle` resolves to nothing and returns `Config key not found: pageTitle`. Run `action=list` to see the real shape.

Boolean keys accept `true` or `false`. Structured values are accepted as JSON, which is how you set the two keys with non-scalar shapes:

```bash
obsidian quartz-syncer:quartz-config action=set key=configuration.ignorePatterns value='["private/**","drafts/**"]'
obsidian quartz-syncer:quartz-config action=set key=configuration.analytics value='{"provider":"plausible"}'
```

Those two have no field in the [[Guides/Quartz Hub#Config tab|Hub's Config tab]], so the CLI and editing `quartz.config.yaml` by hand are the only ways to reach them.

> [!WARNING] Values are not schema-validated, and unknown keys are created
>
> `action=set` writes whatever you give it and does not check the key against the Quartz schema. A mistyped path adds a new key to your config rather than failing, and an out-of-range value (for example a `configuration.theme.fontOrigin` other than `googleFonts` or `local`) is accepted here and only rejected later, by Quartz, at build time.
>
> Check the result with `action=get`, and run a [[Guides/Quartz Hub#Overview tab|build]] to confirm Quartz still accepts the config.

Writes preserve your YAML comments and formatting.

> [!NOTE] Requires Quartz v5 and a local checkout
>
> Config editing needs [[Local Quartz repo path|a local repository]] and a Quartz v5 config format. The [[Guides/Quartz Hub#Config tab|Quartz Hub's Config tab]] is the UI equivalent.

### `quartz-syncer:quartz-build`

Run a Quartz build of the local repository.

> [!NOTE] Desktop only
>
> This command needs a [[Local Quartz repo path|local Quartz repository]] and [[Enable system commands]].

```bash
obsidian quartz-syncer:quartz-build
```

Returns `{ message: "Quartz build completed." }`.

### `quartz-syncer:quartz-serve`

Run the Quartz dev server for local preview.

> [!NOTE] Desktop only
>
> This command needs a [[Local Quartz repo path|local Quartz repository]] and [[Enable system commands]].

```bash
obsidian quartz-syncer:quartz-serve
obsidian quartz-syncer:quartz-serve port=8081
```

| Parameter | Description |
|------|-------------|
| `port` | Port to serve on. Default `8080`. |

Returns `{ port, message }`. Startup takes 15–20 seconds before the site responds.

### `quartz-syncer:quartz-sync`

Run Quartz git sync against the local repository.

> [!NOTE] Desktop only
>
> This command needs a [[Local Quartz repo path|local Quartz repository]] and [[Enable system commands]].

```bash
obsidian quartz-syncer:quartz-sync
obsidian quartz-syncer:quartz-sync pull=false
obsidian quartz-syncer:quartz-sync message="Manual sync"
```

| Parameter | Description |
|------|-------------|
| `commit` | Whether to commit. Default `true`. |
| `push` | Whether to push. Default `true`. |
| `pull` | Whether to pull. Default `true`. |
| `message` | Custom commit message. Defaults to whatever Quartz uses. |

The three booleans accept `true`, `1`, `yes`, `on`, `false`, `0`, `no` and `off`.

> [!TIP] Pairs with local publishing
>
> With [[Publish to]] set to **Local folder**, Quartz Syncer writes files but does not commit. `quartz-sync` is how you get those writes to your remote.

### `quartz-syncer:quartz-restore`

Restore Quartz content from cache.

> [!NOTE] Desktop only
>
> This command needs a [[Local Quartz repo path|local Quartz repository]] and [[Enable system commands]].

```bash
obsidian quartz-syncer:quartz-restore force
```

| Parameter | Description |
|------|-------------|
| `force` | **Required.** Confirms the restoration. |

### `quartz-syncer:repo`

Inspect or change the repository connection.

```bash
obsidian quartz-syncer:repo action=info
obsidian quartz-syncer:repo action=set-local path=/path/to/quartz
obsidian quartz-syncer:repo action=set-remote
obsidian quartz-syncer:repo action=verify path=/path/to/quartz
```

| Parameter | Description |
|------|-------------|
| `action` | `info` (default), `set-local`, `set-remote`, or `verify`. |
| `path` | Local repository path, for `set-local` and `verify`. |
| `format` | Output format: `json` or `text` (default). |

`action=info` is the quickest way to see how the [[Publish to|publish destination]] resolved:

```json
{
  "mode": "remote",
  "requestedTarget": "local",
  "targetOverridden": true,
  "blocker": "local-requires-desktop",
  "localPath": "/home/me/quartz",
  "remoteUrl": "https://github.com/me/quartz.git",
  "branch": "v5",
  "contentFolder": "content"
}
```

`action=verify` checks a path without saving it, returning `{ path, valid, quartzVersion, reason? }`.

### `quartz-syncer:media`

List, find, or clean media files in the Quartz repository.

```bash
obsidian quartz-syncer:media action=list
obsidian quartz-syncer:media action=orphaned
obsidian quartz-syncer:media action=clean force dry-run
obsidian quartz-syncer:media action=clean force
```

| Parameter | Description |
|------|-------------|
| `action` | `list` (default), `orphaned`, or `clean`. |
| `force` | **Required** for `action=clean` when there is anything to delete. |
| `dry-run` | Preview the cleanup. |
| `format` | Output format: `json` or `text` (default). |

| Action | Output |
| --- | --- |
| `list` | `{ count, files: [{ path, linked, size }] }` |
| `orphaned` | `{ count, files: [{ path, size }] }` |
| `clean` | `{ cleaned }`, or `{ dryRun: true, wouldClean, files }` |

Orphaned means no *published note* links the file. See [[Automatically clean orphaned media]] to do this automatically after each publish.

### `quartz-syncer:diff`

Show the compiled diff between your vault and the publish destination.

```bash
obsidian quartz-syncer:diff
obsidian quartz-syncer:diff path=notes/post.md
```

| Parameter | Description |
|------|-------------|
| `path` | Diff one specific file. Omit for everything pending. |
| `format` | Output format: `json` or `text` (default). |

Returns `{ count, diffs }`, where each diff is `{ path, status, local, remote }`. `status` is `new` or `changed`; `local` and `remote` may be `null`.

### `quartz-syncer:validate`

Validate the Quartz repository state.

```bash
obsidian quartz-syncer:validate
```

| Parameter | Description |
|------|-------------|
| `format` | Output format: `json` or `text` (default). |

Returns `{ valid, quartzVersion, checks }`, where each check is `{ check, passed, detail }`. `quartzVersion` is one of `v5-yaml`, `v5-json`, `v4` or unknown. A failing validation returns `success: false`.

### `quartz-syncer:inspect`

Inspect internal cache, hashes, and compilation state. Useful for debugging; not needed in normal use.

```bash
obsidian quartz-syncer:inspect
obsidian quartz-syncer:inspect target=hashes
obsidian quartz-syncer:inspect target=queue
obsidian quartz-syncer:inspect target=cache path=notes/post.md
```

| Parameter | Description |
|------|-------------|
| `target` | `all` (default), `cache`, `hashes`, `compilation`, or `queue`. |
| `path` | Narrow `cache`, `hashes` or `compilation` to one file. |
| `format` | Output format: `json` or `text` (default). |

| Target | Output |
| --- | --- |
| `cache` | `{ entries, files }`, or `{ path, cached, localHash, remoteHash }` with a path |
| `hashes` | `{ count, hashes: [{ path, localHash, remoteHash, match }] }` |
| `compilation` | `{ totalFiles }`, or `{ path, compiled, contentLength, blobCount }` with a path |
| `queue` | `{ running, pending, autoPublish }` |
| `all` | All four, nested |

## Flags

### Common to most commands

- `format=json` — Structured JSON output, shaped `{ success, data?, error? }`. Useful for scripts.
- `format=text` — Human-readable text. The default. String results print directly, objects print as `Success: <pretty JSON>`, failures as `Error: <message>`.
- `verbose` — Detailed output: file paths, connection details, commit SHAs.
- `help` — Show that command's help and parameters.

### `dry-run`

Preview without changing anything. Supported by `sync`, `publish`, `delete`, `mark`, `upgrade`, `plugin`, `media` and `cache action=prune-foreign`.

### `force`

Required for destructive operations:

| Command | Why |
| --- | --- |
| `delete` | Always, including with `dry-run` |
| `sync` | To run the delete phase. Publishing alone needs no `force`. |
| `publish action=arbitrary` | Writes outside the content folder |
| `config action=reset` | Overwrites your settings |
| `media action=clean` | Deletes files |
| `cache action=prune-foreign` | Deletes cache databases, including with `dry-run` |
| `quartz-restore` | Overwrites local content |

Remember that `force=false` does **not** arm these — `force` must be present as a bare flag.

Long-running commands include timing in the output, for example `Published 47 files. (23.4s)`.

## Unpublishing notes

`delete force` on its own deletes **only notes that were removed from your vault**. To remove a currently published note from the destination while keeping the vault note, use `action=unpublish` with an explicit `path`:

```bash
obsidian quartz-syncer:delete action=unpublish path="notes/post.md" force dry-run format=json
obsidian quartz-syncer:delete action=unpublish path="notes/post.md" force verbose
```

The contract:

- `force` is required, even for `dry-run`.
- `dry-run` lists every matched note without deleting anything.
- Only currently **published** (in-sync) notes are eligible. No matches is an error, not a no-op.
- Glob and fuzzy patterns are supported, but execution is blocked if the pattern matches more than 80% of your published notes and there are more than five. `dry-run` still lists them, with a warning. Narrow the pattern or use exact paths.
- Frontmatter is **not** changed. The note stays publishable and can be published again — including by [[Auto-publish interval|auto-publish]], if enabled.
- [[Automatically clean orphaned media|Orphan media cleanup]] still applies to real execution, never to `dry-run`.

The UI equivalent is selecting notes under **Published** in the Publication Center and pressing Delete. See [[Usage Guide#Unpublishing a note]].

### For agents

The operability facade exposes the same operation with an explicit list of exact vault paths:

```javascript
await window.__QS__.act({
	name: "pub.unpublish",
	params: { paths: ["notes/post.md"], confirm: true },
});
```

`confirm: true` is mandatory. Every path must match a currently published note or the whole request is rejected; duplicates are removed; no glob expansion happens. `pub.delete` remains deleted-only.

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
# See what the pattern matches before touching anything
obsidian quartz-syncer:mark path="blog/**/*.md" state=publish dry-run

# Mark them (state is required — omitting it toggles)
obsidian quartz-syncer:mark path="blog/**/*.md" state=publish

# Publish them
obsidian quartz-syncer:publish
```

### Unpublish a note without deleting it

```bash
obsidian quartz-syncer:delete action=unpublish path="notes/old-post.md" force dry-run
obsidian quartz-syncer:delete action=unpublish path="notes/old-post.md" force
```

### Quartz management

```bash
# Run a local Quartz build
obsidian quartz-syncer:quartz-build

# Start the local preview server
obsidian quartz-syncer:quartz-serve port=8080

# Commit and push the local checkout (useful with local publishing)
obsidian quartz-syncer:quartz-sync
```

### Check where publishing is going

```bash
# Resolved destination, any blocker, and the paths in use
obsidian quartz-syncer:repo action=info format=json

# Test that destination end to end
obsidian quartz-syncer:test verbose
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
