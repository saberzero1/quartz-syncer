# Quartz Syncer

Obsidian Community Plugin. Publishes Obsidian notes to [Quartz](https://quartz.jzhao.xyz/) static sites via Git over HTTPS.

## Build

- Package manager: npm
- Bundler: esbuild (`node esbuild.config.mjs production`)
- Unit tests: Vitest (`npx vitest run`)
- E2E tests: WebdriverIO
- Integration tests: Playwright
- Type check: `npx tsc --noEmit`
- Lint: `npm run lint` (ESLint + Stylelint). CSS only: `npm run lint:css`
- isomorphic-git fork: published as `@saberzero1/isomorphic-git`. Import it by that name — never bare `isomorphic-git`. Obsidian enforces npm 12, which rejects git-based dependencies, so **no dependency may resolve from a git URL**: never `file:../isomorphic-git`, never `https://github.com/...`. Verify with `grep -c "git+" package-lock.json` — it must be `0`.

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

Publishing destination is explicit, never inferred. `publishTarget` (`"local" | "remote"`) selects it; `resolvePublishTarget()` in `src/publisher/PublishTargetResolver.ts` is the single source of truth and every publication surface must use it instead of testing `quartzRepoPath`/`gitRemoteUrl` directly. A requested-but-unconfigured destination resolves to `null` rather than silently falling back; the only automatic override is local-on-mobile, which reports `overridden: true`.

`quartzRepoPath` has a second, independent role: the local checkout used for Quartz site management (Hub, build, preview, plugins). Management code reads it directly regardless of `publishTarget`, and nothing may clear it to switch destinations.

Publish status is computed against one destination's tree, so `StatusCacheService` is keyed by `publishTargetIdentity()`. Results arriving for a stale destination are discarded.

`publish: true` in frontmatter marks a file as **publishable** — visible in the Publication Center. It does NOT auto-publish. The user selects which files to publish. ALL files in the Publication Center are selectable, including "Published" (already synced) files.

Media files linked by notes are pushed alongside them automatically. Orphaned media (unlinked) can be cleaned automatically via `autoCleanOrphanedMedia` setting.

### Publication Center

Uses persistent shell + `PublicationTree` class with keyed DOM row maps. State changes update checkbox properties and CSS classes in-place — no full DOM rebuilds. This preserves `checkbox.indeterminate`, scroll position, and input focus.

The Delete button is real and destructive: it calls `Publisher.deleteBatch()` for selected `deleted`/`published` notes and `Publisher.deleteByRepoPaths()` for selected media and custom files. `collectDeletions()` is the single predicate deciding what is deletable, and both `handleDelete()` and the button's enabled state read it — keep them on that one helper so they cannot drift. `changed` and `unpublished` files are deliberately not deletable, so selecting only those leaves the button disabled.

Note that the button performs no confirmation step, while the two programmatic surfaces both demand one: the facade's `pub.delete` requires `confirm: true`, and the CLI's `delete` requires `force`.

## CLI

22 commands registered via `registerCliHandler()` (Obsidian 1.12.2+ API). NOT `registerObsidianProtocolHandler` — that is for URL protocol handling, not CLI.

Commands are defined in `COMMAND_REGISTRY` in `src/cli/registerCliHandlers.ts`. The CLI itself is desktop-only — no `Platform.isDesktopApp` checks in handlers.

### Argument and flag contract

Obsidian hands over `CliData`, a flat `Record<string, string | 'true'>`. A bare flag (`force`) and an explicit `value=true` both arrive as the string `"true"`; `value=` arrives as `""`. The payload alone cannot tell a flag from a value.

`COMMAND_REGISTRY` is what resolves that ambiguity, so its `args`/`flags` split is load-bearing for parsing, not just for help text:

- Declare every value-taking parameter under `args`. `normalizeCliParams()` preserves whatever such a parameter was given, including `"true"` and `""`. Omit it and `value=true` is silently reclassified as a flag, making the value unreachable.
- Declare every boolean parameter under `flags`. Undeclared names fall back to "flag-shaped values become flags".
- A name must never appear in both lists for the same command. A test pins this.

An explicit `force=false` deliberately stays out of `flags`, leaving destructive commands disarmed. Do not "simplify" this by classifying declared flags by name.

Tests that build `CliParams` by hand bypass normalization entirely, so they cannot catch parsing bugs. Parsing regressions belong in `test/unit/cli/registerCliHandlers.test.ts`, which dispatches raw `CliData` through the registered callback.

## Quartz v5

Quartz v5 uses `quartz.config.default.yaml` as the base configuration. `quartz.config.yaml` is optional — it contains user overrides only. If absent, Quartz falls back to the default. Do not assume `quartz.config.yaml` exists in a fresh Quartz repo.

The Quartz CLI is accessed via `npx quartz <command>`. Available commands: `create`, `upgrade`/`update`, `restore`, `sync`, `build`, `tui`, `plugin [subcommand]`.

GitHub's template API (`POST /repos/{template}/generate`) is asynchronous — the response returns before template content is populated. Poll for completion before committing additional files.

## Settings

Declarative settings only (Obsidian minAppVersion 1.13). Definitions in `getSettingDefinitions()`. Schema version 5. Migrations in `src/main.ts`.

`loadSettings()` keeps the raw persisted record and passes it to migrations. Migrations MUST detect "was this key ever persisted?" from that raw record, not from `this.settings` — `DEFAULT_SETTINGS` is merged in first, so an un-migrated record otherwise looks like it is already at the current schema version.

## Conventions

- Strict TypeScript. No `as any`, no `@ts-ignore`.
- Tabs for indentation.
- Sentence case for user-facing strings.
- No new runtime dependencies.
- `Platform.isDesktopApp` (not `Platform.isDesktop`).
- Keep `src/main.ts` minimal — lifecycle + settings only.

## Styling

All plugin CSS lives in the single top-level `styles.css`. There is no preprocessor and no CSS framework.

### Design tokens

Spacing, surfaces, status colours, and label treatment come from a `--qs-*` token block at the top of `styles.css`. Every token derives from an Obsidian variable, which is what keeps the plugin theme-reactive across light/dark and third-party themes. Use the tokens rather than reaching for raw Obsidian variables ad hoc — that is what keeps a Hub status label and a Publication Center category label the same size.

Never add a hard-coded colour, and never add a raw px font size.

**The token block must stay on `body`.** Obsidian declares its theme variables (`--background-primary`, `--color-green`, …) on `body`, not on `:root`. A token defined at `:root` resolves `var(--background-primary)` against `:root`, where it is undefined, and the token silently becomes invalid at computed-value time. Moving the block to `:root` breaks every token without any build or test failure.

Status colours flow from three tone tokens — `--qs-tone-new`, `--qs-tone-changed`, `--qs-tone-gone` — consumed by the Publication Center row rails (`.tree-rail-*`), the `.qs-dot` status dots, and the Hub chips. Change a state colour there, not at the call site.

### The `.qs-hidden` trap

`.qs-hidden` is written as `.qs-hidden.qs-hidden.qs-hidden`. The repetition is load-bearing, not a typo: it raises the selector to specificity (0,3,0) so it beats two-class component rules such as `.qs-pub-center .tree-category-header`, which set `display` and would otherwise win — leaving the element visible while the calling code believes it hid it.

This exact failure shipped once — `TreeRenderer.update()` correctly called `toggleClass("qs-hidden", count === 0)` on empty category headers, and they rendered anyway. Collapsing the selector back to a single `.qs-hidden` reintroduces that bug across all `qs-hidden` call sites at once, and no unit test will catch it.

`!important` would also fix it, but it is banned — see CSS linting below.

### CSS linting

`npm run lint:css` runs Stylelint with [`stylelint-config-obsidianmd`](https://github.com/obsidianmd/stylelint-config) — the same rules the Obsidian community plugin review uses. It is wired into `npm run lint`, so CI already enforces it.

`declaration-no-important` is raised from the config's default `warning` to **`error`**: the community scanner flags `!important`, so it must fail the build rather than be quietly tolerated. Fix specificity conflicts by making the selector more specific, never by reaching for `!important`.

Two consequences worth knowing:

- Media queries must use range syntax — `@media (width <= 820px)`, not `(max-width: 820px)`.
- Use `rgb()` rather than the `rgba()` alias, even with an alpha channel.

`npm run lint:css:fix` auto-fixes both.

### What tests cannot see

`vitest` runs in jsdom, which has no layout engine. Geometry bugs — a stretched checkbox, a misaligned grid column, text wrapping onto four lines, an element that should be hidden but is not — pass `tsc`, `eslint`, and the entire unit suite. Verify layout changes in a running Obsidian instance with `getBoundingClientRect()` / `getComputedStyle()` probes, not by reading the stylesheet.

### Verifying layout in Obsidian

Two traps make live layout probes unreliable:

- **Stale modals.** Modals survive `disablePlugin`/`enablePlugin` and accumulate in the DOM, and `document.querySelector` returns the *first* — usually a dead one. Close everything with repeated `Escape` keydowns (`.modal-close-button.click()` does not reliably work), confirm `document.querySelectorAll('.modal').length === 0`, then open exactly one. Prefer reading state off the live instance via `window.__QS__.plugin.publicationCenterManager.modal`.
- **Window resizing.** `window.resizeTo()` works for testing breakpoints, but under Wayland the renderer viewport can desync from the Electron window — `innerWidth` freezes while `getCurrentWindow().getBounds()` reports the new size. Always assert the new `innerWidth` before trusting a breakpoint result. To recover, set bounds via `require('@electron/remote').getCurrentWindow()` and then `location.reload()` to resync.

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
| `[data-qs="pub-row"]` | File row (has `data-qs-path`; has `data-qs-checking="true"` while a dynamic note's category is still being resolved) |
| `[data-qs="pub-checkbox"]` | File/category checkbox (has `data-qs-path` or `data-qs-category`) |
| `[data-qs="pub-category"]` | Category header (has `data-qs-value`) |
| `[data-qs="pub-tab"]` | Tab button (has `data-qs-value`) |
| `[data-qs="pub-publish-btn"]` | Publish button |
| `[data-qs="pub-delete-btn"]` | Delete button |
| `[data-qs="pub-search"]` | Filter input |
| `[data-qs="pub-progress"]` | Progress bar indicator |
| `[data-qs="pub-target"]` | Publish destination line (has `data-qs-value`: local/remote/none) |
| `[data-qs="pub-error"]` | Status-load error message |
| `[data-qs="pub-retry"]` | Retry status loading button |
| `[data-qs="wizard"]` | Onboarding wizard modal |
| `[data-qs="wizard-step"]` | Step indicator (has `data-qs-value`) |
| `[data-qs="wizard-choice"]` | Onboarding flow card on the first step (has `data-qs-value`: create/connect) |
| `[data-qs="wizard-back"]` | Back button (absent on the first step) |
| `[data-qs="wizard-next"]` | Next/continue/create button |
| `[data-qs="wizard-input"]` | Input field (has `data-qs-field`) |
| `[data-qs="wizard-error"]` | Error display |
| `[data-qs="statusbar"]` | Status bar (has `data-qs-state`: ready/compiling/error/unconfigured) |
| `[data-qs="diff-view"]` | Diff viewer modal |
| `[data-qs="notice"]` | Version-upgrade notice modal (blocks the UI until dismissed) |
| `[data-qs="terminal"]` | Terminal output modal |
| `[data-qs="terminal-output"]` | Terminal output `<pre>` |
| `[data-qs="terminal-action"]` | Terminal button (has `data-qs-value`: cancel/copy/close) |
| `[data-qs="hub"]` | Quartz Hub modal |
| `[data-qs="hub-tab"]` | Hub tab button (has `data-qs-value`) |
| `[data-qs="hub-status"]` | Hub status panel |
| `[data-qs="hub-action"]` | Hub action button (has `data-qs-value`) |
| `[data-qs="hub-serve-status"]` | Preview-server status row on the Overview tab |
| `[data-qs="hub-setup-link-path"]` | Setup tab: existing-repo path input |
| `[data-qs="hub-setup-link"]` | Setup tab: link button |
| `[data-qs="hub-setup-clone-url"]` | Setup tab: clone URL input |
| `[data-qs="hub-setup-clone-dest"]` | Setup tab: clone destination input |
| `[data-qs="hub-setup-clone"]` | Setup tab: clone button |
| `[data-qs="settings-test-btn"]` | Git settings: test connection button |
| `[data-qs="settings-test-result"]` | Git settings: test connection result text |
| `[data-qs="cache-cleanup"]` | Cache cleanup modal |
| `[data-qs="cache-cleanup-item"]` | Cache cleanup entry (has `data-qs-name`) |
| `[data-qs="cache-cleanup-empty"]` | Cache cleanup empty state |
| `[data-qs="cache-cleanup-confirm"]` | Cache cleanup confirm button |
| `[data-qs="cache-cleanup-cancel"]` | Cache cleanup cancel button |
| `[data-qs="manual-setup"]` | Manual setup modal (mobile / no-wizard Git setup) |
| `[data-qs="manual-input"]` | Manual setup field (has `data-qs-field`: url/branch/auth-type/username/token/cors/content-folder) |
| `[data-qs="manual-action"]` | Manual setup button (has `data-qs-value`: test/save) |
| `[data-qs="manual-test-result"]` | Manual setup connection-test result text |
| `[data-qs="settings-input"]` | Settings field (has `data-qs-field`, e.g. remote-url/branch/token/repo-path/publish-target) |
| `[data-qs="settings-action"]` | Settings button (has `data-qs-value`, e.g. save-token/clear-token/open-hub) |
| `[data-qs="settings-status"]` | Settings status text (has `data-qs-field`, e.g. token/readiness/quartz-version/plugin-updates) |
| `[data-qs="wizard-select"]` | Wizard dropdown (has `data-qs-field`: repo) |
| `[data-qs="wizard-checkbox"]` | Wizard checkbox (has `data-qs-field`: private) |
| `[data-qs="wizard-action"]` | Wizard terminal action (has `data-qs-value`: open-publication-center/done) |
| `[data-qs="wizard-state"]` | Wizard progress or validation text (has `data-qs-field`: validation/creating/loading/repo-count) |
| `[data-qs="hub-state"]` | Hub tab load state (has `data-qs-value`: loading/error/empty/unavailable) |
| `[data-qs="hub-plugin-row"]` | Hub plugin entry (has `data-qs-name`) |
| `[data-qs="hub-plugin-action"]` | Hub plugin button (has `data-qs-name` and `data-qs-value`: enable/disable/remove) |
| `[data-qs="hub-plugin-status"]` | Hub plugin enabled/disabled status (has `data-qs-name`) |
| `[data-qs="hub-template-row"]` | Hub template entry (has `data-qs-name`) |
| `[data-qs="hub-template-action"]` | Hub template apply button (has `data-qs-name`) |
| `[data-qs="hub-config-input"]` | Hub Quartz config field (has `data-qs-field`) |
| `[data-qs="hub-config-action"]` | Hub Quartz config button (has `data-qs-value`: save) |
| `[data-qs="hub-layout-input"]` | Hub layout priority input (has `data-qs-name`) |
| `[data-qs="hub-setup-status"]` | Setup tab path-validation status text |
| `[data-qs="plugin-browser"]` | Plugin browser modal |
| `[data-qs="plugin-browser-input"]` | Plugin browser control (has `data-qs-field`: search/category/source/sort/view) |
| `[data-qs="plugin-browser-item"]` | Plugin browser entry (has `data-qs-name`) |
| `[data-qs="plugin-browser-action"]` | Plugin browser install button (has `data-qs-name`) |
| `[data-qs="plugin-browser-status"]` | Plugin browser per-entry install status (has `data-qs-name`) |
| `[data-qs="plugin-browser-state"]` | Plugin browser registry state (has `data-qs-value`: loading/error/empty) |
| `[data-qs="pub-setup-btn"]` | Publication center empty-state setup button |
| `[data-qs="pub-add-file"]` | Publication center advanced-tab add-file button |
| `[data-qs="diff-action"]` | Diff control (has `data-qs-value`: split/unified/expand-all/back) |

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

**Async eval needs the IIFE + `console.log` pattern.** Top-level `await` produces no output:
```bash
# WRONG — no output:
obsidian eval code="await window.__QS__.act({name:'pub.open'})" 2>/dev/null

# CORRECT — prints the result:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

Synchronous calls return values directly:
```bash
obsidian eval code="typeof window.__QS__" 2>/dev/null
# => object
```

**`obsidian eval` has a result window of roughly 5–15 ms.** The IIFE pattern above works, but it can only capture output emitted *before* `eval` returns. Anything logged after that is silently lost — you get an empty result, not an error. Measured on Obsidian 1.12.7:

| Body | Output |
|---|---|
| `console.log('x')` (sync) | captured |
| `(async()=>{console.log('x')})()` | captured |
| `await Promise.resolve(42)` then log | captured |
| `await new Promise(r=>setTimeout(r,4))` then log | captured |
| `await new Promise(r=>setTimeout(r,16))` then log | **lost** |
| `await new Promise(r=>setTimeout(r,3000))` then log | **lost** |

The limit is **duration, not asynchrony**. Microtasks and sub-frame timers resolve inside the window; real waits do not.

This makes printed output unreliable for facade actions that do real work. The *same* action can print or not depending on cache warmth — `act({name:'pub.open'})` prints `{"success":true}` when the status is warm, and prints nothing on a cold tree. Never treat missing output as failure; confirm with a follow-up synchronous query (`dev:dom`, `snapshot()`, `assert(...)`).

For anything that deliberately waits, stash the result on a global and read it back with a second, synchronous eval:
```bash
obsidian eval code="window.__probe='pending';(async()=>{await new Promise(r=>setTimeout(r,3000));window.__probe=JSON.stringify({done:true})})()" 2>/dev/null
sleep 5
obsidian eval code="window.__probe" 2>/dev/null
# => {"done":true}
```

**`JSON.stringify` throws on some facade results.** `act({name:'status.refresh'})` resolves to `{success, data}` where `data` is a live `PublishStatus` holding `PublishFile` objects with circular references. `console.log(JSON.stringify(r))` fails with `Converting circular structure to JSON`. Log a projection instead:
```bash
# WRONG — throws:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()" 2>/dev/null

# CORRECT — project the fields you need:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify({success:r.success,counts:{unpublished:r.data.unpublished.length,changed:r.data.changed.length,published:r.data.published.length,deleted:r.data.deleted.length}}))})()" 2>/dev/null
```
`snapshot()` is always safe to stringify — it is a redacted, plain-object view.

**`env.emulateMobile` cannot exercise the mobile code paths.** It calls Obsidian's `app.emulateMobile()`, which reloads the app and flips `Platform.isMobile` — but **not** `Platform.isDesktopApp`, because the process is still desktop Electron. Every `Platform.isDesktopApp` branch therefore keeps taking the desktop path, and that flag gates the whole two-tier platform split. Verified: with the remote unconfigured under active emulation, the Publication Center empty state still renders "Open setup wizard" (desktop) rather than "Open manual setup" (mobile).

Consequences:

- The *branch selection* between desktop and mobile UI cannot be emulated. Paths that pick a surface with `Platform.isDesktopApp` always choose the desktop one, so e.g. the Publication Center empty state cannot be made to route to `ManualSetupModal`.
- `ManualSetupModal` itself is still reachable on desktop: the `quartz-syncer:manual-setup` command is registered unconditionally, so `obsidian command id=quartz-syncer:manual-setup` opens it for verification.
- `snapshot().plugin.platform` is derived from `isDesktopApp` and so reads `"desktop"` during emulation. Use `snapshot().plugin.mobileEmulated` to detect the emulated state.
- Emulation is still useful for layout and CSS checks, which respond to the `is-mobile` body class.


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
sleep 3 && obsidian dev:dom selector='[data-qs="terminal"]' total 2>/dev/null
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
