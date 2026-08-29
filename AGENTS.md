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

### Quartz Hub

Desktop-only modal (`src/views/QuartzHub/`) for local Quartz repository management. Accessible from command palette (`quartz-syncer:open-hub`), settings ("Open Quartz Hub" button), and operability facade (`act('hub.open')`). Tab-based layout:

- **Overview** — repo status (path, Quartz version, binaries, serve state) + action buttons (Preview, Build, Update, Install deps, Plugins, Open folder)
- **Setup** — link existing local repo (path → validate → save) or clone from remote (URL → git clone → npm install → save)

Services: `QuartzHubService` (`src/services/QuartzHubService.ts`) handles status assembly, path validation, and preflight checks. `QuartzHubManager` (`src/operability/QuartzHubManager.ts`) is the singleton modal owner.

### Publication model

`publish: true` in frontmatter marks a file as **publishable** — visible in the Publication Center. It does NOT auto-publish. The user selects which files to publish. ALL files in the Publication Center are selectable, including "Published" (already synced) files.

Media files linked by notes are pushed alongside them automatically. Orphaned media (unlinked) can be cleaned automatically via `autoCleanOrphanedMedia` setting.

### Publication Center

Uses persistent shell + `PublicationTree` class with keyed DOM row maps. State changes update checkbox properties and CSS classes in-place — no full DOM rebuilds. This preserves `checkbox.indeterminate`, scroll position, and input focus.

## CLI

22 commands registered via `registerCliHandler()` (Obsidian 1.12.2+ API). NOT `registerObsidianProtocolHandler` — that is for URL protocol handling, not CLI.

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

## Operability layer

The codebase includes an operability layer (`src/operability/`) that enables AI agents to programmatically inspect, interact with, and verify plugin behavior through the Obsidian CLI.

### Enabling

- **Dev builds** (`npm run dev`): The operability facade is always-on via the `__DEV__` compile-time flag.
- **Production builds**: Enable `ENABLE_DEVELOPER_TOOLS` in plugin settings (`obsidian quartz-syncer:config action=set key=ENABLE_DEVELOPER_TOOLS value=true`).

### Agent channel

All agent interaction goes through the Obsidian CLI (requires Obsidian running):

| Command | Purpose |
|---|---|
| `obsidian eval code="..."` | Execute JavaScript in Obsidian's context |
| `obsidian dev:dom selector="..." text` | Query DOM elements |
| `obsidian dev:dom selector="..." total` | Count DOM elements |
| `obsidian dev:console level=error` | Check for errors |
| `obsidian dev:screenshot path=/tmp/verify.png` | Capture screenshot |
| `obsidian command id=quartz-syncer:status` | Run CLI commands |

### Facade API (`window.__QS__`)

When enabled, `window.__QS__` exposes:

- `snapshot()` — redacted plugin state (settings, engine, publisher, cache, errors). Cheap — returns cached state, does not trigger recomputation.
- `events.tail(n)` / `events.since(cursor)` — ring buffer of plugin events (publish, compile, errors).
- `act(action)` — semantic actions: `pub.open`, `pub.publish`, `status.refresh`, `connection.test`, `env.emulateMobile`, etc. Destructive actions require `confirm: true`.
- `assert(check, params?)` — structured verification: `health.core`, `health.configured`, `engine.idle`, `pub.status.matches`, `errors.none`.
- `waitFor(condition, params?, timeoutMs?)` — async polling with structured timeout result.
- `reloadSelf()` — deterministic plugin reload (desktop only).

Types: `src/operability/types.ts`. Ring buffer: `src/operability/EventBuffer.ts`.

### DOM contract

All agent-queryable UI elements use `data-qs` attributes generated by `qsDom()` from `src/operability/DomContract.ts`. Use `[data-qs="..."]` selectors exclusively — never raw CSS classes.

| Selector | Element |
|---|---|
| `[data-qs="pub-center"]` | Publication center modal |
| `[data-qs="pub-row"]` | File row (has `data-qs-path`) |
| `[data-qs="pub-checkbox"]` | File/category checkbox (has `data-qs-path` or `data-qs-category`) |
| `[data-qs="pub-category"]` | Category header (has `data-qs-value`) |
| `[data-qs="pub-tab"]` | Tab button (has `data-qs-value`) |
| `[data-qs="pub-publish-btn"]` | Publish button |
| `[data-qs="pub-delete-btn"]` | Delete button |
| `[data-qs="pub-search"]` | Filter input |
| `[data-qs="pub-progress"]` | Progress bar indicator |
| `[data-qs="wizard"]` | Onboarding wizard modal |
| `[data-qs="wizard-step"]` | Step indicator (has `data-qs-value`) |
| `[data-qs="wizard-next"]` | Next/continue/create button |
| `[data-qs="wizard-input"]` | Input field (has `data-qs-field`) |
| `[data-qs="wizard-error"]` | Error display |
| `[data-qs="statusbar"]` | Status bar (has `data-qs-state`: ready/compiling/error/unconfigured) |
| `[data-qs="diff-view"]` | Diff viewer modal |
| `[data-qs="hub"]` | Quartz Hub modal |
| `[data-qs="hub-tab"]` | Hub tab button (has `data-qs-value`) |
| `[data-qs="hub-status"]` | Hub status panel |
| `[data-qs="hub-action"]` | Hub action button (has `data-qs-value`) |
| `[data-qs="hub-path"]` | Hub repo path input |

### Services

Business logic is extracted into services that the facade, UI, and CLI can all call:

- `PublicationService` (`src/services/PublicationService.ts`) — wraps Publisher for status, publish, delete, orphan cleanup.
- `OnboardingService` (`src/services/OnboardingService.ts`) — GitHub API orchestration for token validation, repo creation/connection, configuration.

### Agent interaction patterns

**Suppress CLI noise.** All `obsidian` CLI commands produce GTK/Electron warnings on Linux. Always append `2>/dev/null`:
```bash
obsidian eval code="..." 2>/dev/null
obsidian dev:dom selector="..." total 2>/dev/null
```

**Async eval loses return values.** `obsidian eval` cannot capture return values from async code. Use the IIFE + `console.log` pattern:
```bash
# WRONG — returns (no output):
obsidian eval code="await window.__QS__.act({name:'pub.open'})" 2>/dev/null

# CORRECT — prints the result:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

Synchronous calls return values directly:
```bash
obsidian eval code="typeof window.__QS__" 2>/dev/null
# => object
```

**Setting input values requires `dispatchEvent`.** DOM `.value` assignment does not trigger event listeners. Always dispatch an `input` event after setting:
```bash
obsidian eval code="const el=document.querySelector('[data-qs=\"hub-setup-clone-url\"]');el.value='https://example.com/repo.git';el.dispatchEvent(new Event('input',{bubbles:true}))" 2>/dev/null
```

**Wait times after operations.** These are approximate minimums:
| Operation | Wait |
|---|---|
| Plugin reload (`disablePlugin` + `enablePlugin`) | 3 seconds |
| Modal open (`act('pub.open')`, `act('hub.open')`) | 2 seconds |
| Status refresh with compilation | 5 seconds |
| `npm run build:dev` | Completes synchronously (wait for exit) |
| `npm install` via Hub | 30+ seconds |
| `git clone` via Hub | 30+ seconds |
| Quartz build | 5-15 seconds |
| Quartz preview serve startup | 15-20 seconds |

**Verify actions took effect.** After triggering an action via eval (e.g., clicking a button), always follow up with a DOM query or screenshot to confirm:
```bash
# Click a button
obsidian eval code="document.querySelector('[data-qs=\"hub-action\"][data-qs-value=\"build\"]')?.click()" 2>/dev/null
# Verify the terminal modal opened
sleep 3 && obsidian dev:dom selector='.qs-terminal-output' total 2>/dev/null
```

**Build + reload is a two-step process.** `npm run build:dev` compiles and copies to the test vault, but the running Obsidian instance still uses the old code until the plugin is reloaded:
```bash
npm run build:dev
obsidian eval code="(async()=>{await app.plugins.disablePlugin('quartz-syncer');await new Promise(r=>setTimeout(r,1000));await app.plugins.enablePlugin('quartz-syncer')})()" 2>/dev/null
sleep 3
```

**Console capture requires debugger.** `obsidian dev:console` only works after `obsidian dev:debug on` has been run in the current Obsidian session. `obsidian dev:errors` works without it.

### Agent verification playbook

```bash
# 0. One-time setup (once per Obsidian session)
obsidian dev:debug on 2>/dev/null

# 1. Build and deploy to test vault
npm run build:dev

# 2. Reload plugin in Obsidian
obsidian eval code="(async()=>{await app.plugins.disablePlugin('quartz-syncer');await new Promise(r=>setTimeout(r,1000));await app.plugins.enablePlugin('quartz-syncer')})()" 2>/dev/null
sleep 3

# 3. Health check
obsidian eval code="JSON.stringify(window.__QS__.assert('health.core'))" 2>/dev/null

# 4. Check publish status
obsidian eval code="JSON.stringify(window.__QS__.snapshot())" 2>/dev/null

# 5. Verify DOM elements
obsidian dev:dom selector='[data-qs="statusbar"]' attr=data-qs-state 2>/dev/null

# 6. Check for errors
obsidian dev:errors 2>/dev/null
obsidian dev:console level=error 2>/dev/null
```

### Verification workflows

Detailed verification procedures are in `.agents/skills/`:

| Skill | Use when |
|---|---|
| `verify-changes` | After any code change — build, reload, health check |
| `verify-publish` | After publisher/compiler changes — end-to-end publish flow |
| `verify-ui` | After view/modal changes — DOM contract queries, screenshots |
| `debug-obsidian` | Something broke — failure bundle, state inspection, event tracing |

## Working with external systems

When implementing against Quartz, GitHub API, Obsidian API, or any external system:
- **Read the actual source/types/docs before writing code.** Do not assume API response shapes, file structures, or CLI interfaces.
- **Fetch actual repo contents** before assuming what files exist or what format they use.
- **Search Obsidian's type definitions** (`node_modules/obsidian/obsidian.d.ts`) for the correct API method — do not guess from method names.
- **Ask the user** about domain-specific behavior rather than inferring from general patterns.
