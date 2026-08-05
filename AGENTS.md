# Quartz Syncer

Obsidian Community Plugin. Publishes Obsidian notes to [Quartz](https://quartz.jzhao.xyz/) static sites via Git over HTTPS.

## Build

- Package manager: npm
- Bundler: esbuild (`node esbuild.config.mjs production`)
- Unit tests: Vitest (`npx vitest run`)
- E2E tests: WebdriverIO
- Integration tests: Playwright
- Type check: `npx tsc --noEmit`
- isomorphic-git fork: `saberzero1/isomorphic-git`. The `package.json` dependency MUST point to `https://github.com/saberzero1/isomorphic-git.git` before committing — never `file:../isomorphic-git`.

## Architecture

### Two-tier platform split

**Core (desktop + mobile):** Publish, sync, delete, status, diff, cache, mark, background compilation. Uses `BundledGitBackend` (isomorphic-git fork) for all Git I/O — no shell commands.

**Management (desktop only):** Quartz config, plugins, upgrades, templates, auto-publish, local preview. Uses `ProcessRunner` → `QuartzRunner` for `npx quartz` commands. Requires local Quartz checkout + Node.js ≥18.

### Key modules

- `BundledGitBackend` — primary Git transport via isomorphic-git. Works everywhere.
- `QuartzFileSource` — interface for reading/writing Quartz repo files. Two implementations: `RemoteFileSource` (Git remote) and `LocalFileSource` (local disk).
- `Publisher` — orchestrates publish/delete/status via `BundledGitBackend` + `DataStore` + `PathMapper`.
- `PublishStatusManager` — categorizes files into unpublished/changed/published/deleted/media.
- `MediaLinkResolver` — tracks which media files are linked by published notes.
- `SyncerPageCompiler` — compilation pipeline: frontmatter → markdown → integration adapters.
- `BackgroundEngine` — watches vault changes, queues compilation, auto-publish timer.
- `ProcessRunner` — desktop-only system command execution with circuit breaker. Timeout sentinel: `-1` = no timeout.
- `QuartzRunner` — wraps `npx quartz` subcommands. `serve()` bypasses `ProcessRunner` singleton to avoid pending process kills.
- `NodeDetector` — checks Node.js ≥18 availability.

### Publication model

`publish: true` in frontmatter marks a file as **publishable** — visible in the Publication Center. It does NOT auto-publish. The user selects which files to publish. ALL files in the Publication Center are selectable, including "Published" (already synced) files.

Media files linked by notes are pushed alongside them automatically. Orphaned media (unlinked) can be cleaned automatically via `autoCleanOrphanedMedia` setting.

### Publication Center

Uses persistent shell + `PublicationTree` class with keyed DOM row maps. State changes update checkbox properties and CSS classes in-place — no full DOM rebuilds. This preserves `checkbox.indeterminate`, scroll position, and input focus.

## CLI

17 commands registered via `registerCliHandler()` (Obsidian 1.12.2+ API). NOT `registerObsidianProtocolHandler` — that is for URL protocol handling, not CLI.

Commands are defined in `COMMAND_REGISTRY` in `src/cli/registerCliHandlers.ts`. The CLI itself is desktop-only — no `Platform.isDesktopApp` checks in handlers.

## Quartz v5

Quartz v5 uses `quartz.config.default.yaml` as the base configuration. `quartz.config.yaml` is optional — it contains user overrides only. If absent, Quartz falls back to the default. Do not assume `quartz.config.yaml` exists in a fresh Quartz repo.

The Quartz CLI is accessed via `npx quartz <command>`. Available commands: `create`, `upgrade`/`update`, `restore`, `sync`, `build`, `tui`, `plugin [subcommand]`.

GitHub's template API (`POST /repos/{template}/generate`) is asynchronous — the response returns before template content is populated. Poll for completion before committing additional files.

## Settings

Declarative settings only (Obsidian minAppVersion 1.13). Definitions in `getSettingDefinitions()`. Schema version 4. Migrations in `src/main.ts`.

## Conventions

- Strict TypeScript. No `as any`, no `@ts-ignore`.
- Tabs for indentation.
- Sentence case for user-facing strings.
- No new runtime dependencies.
- `Platform.isDesktopApp` (not `Platform.isDesktop`).
- Keep `src/main.ts` minimal — lifecycle + settings only.

## Verification

Before claiming completion:
1. `npx tsc --noEmit` — 0 errors
2. `npm run build` — passes
3. `npx vitest run` — all tests pass

## Working with external systems

When implementing against Quartz, GitHub API, Obsidian API, or any external system:
- **Read the actual source/types/docs before writing code.** Do not assume API response shapes, file structures, or CLI interfaces.
- **Fetch actual repo contents** before assuming what files exist or what format they use.
- **Search Obsidian's type definitions** (`node_modules/obsidian/obsidian.d.ts`) for the correct API method — do not guess from method names.
- **Ask the user** about domain-specific behavior rather than inferring from general patterns.
