---
name: verify-changes
description: Post-change verification workflow — build, reload plugin in Obsidian, run health checks, and verify no regressions via the operability facade.
triggers:
    - verify
    - check changes
    - test in obsidian
    - reload plugin
    - does it work
argument-hint: '[file-or-area-changed]'
---

# Verify Changes Skill

## Purpose

After modifying quartz-syncer source code, build the plugin, reload it in a running Obsidian instance, and verify it works correctly using the operability facade (`window.__QS__`). This replaces manual "open Obsidian and click around" verification.

## When to Activate

Activate after any code change that affects runtime behavior — source files in `src/`, settings, CLI handlers, views, services. NOT needed for test-only changes or documentation.

## Prerequisites

- Obsidian must be running with the test vault open.
- Plugin must be built with `npm run build:dev` (copies to test vault, enables facade via `__DEV__` flag).
- The Obsidian CLI must be registered and working (`obsidian eval code="1+1" 2>/dev/null` should return `=> 2`).
- Console capture requires the debugger: run `obsidian dev:debug on 2>/dev/null` once per Obsidian session before using `dev:console`.

## Important: CLI Patterns

**Suppress GTK warnings.** Always append `2>/dev/null` to every `obsidian` CLI command. Linux produces GTK/Electron warnings that clutter output.

**Async eval loses return values.** `obsidian eval` cannot capture return values from async code. Use the IIFE + `console.log` pattern:
```bash
# WRONG — returns nothing:
obsidian eval code="await window.__QS__.act({name:'pub.open'})" 2>/dev/null

# CORRECT — prints the result:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

Synchronous calls return values directly:
```bash
obsidian eval code="typeof window.__QS__" 2>/dev/null
# => object
```

## Workflow

### Step 1: Build and deploy to test vault

```bash
npm run build:dev
```

This builds with `__DEV__=true` (facade mounts automatically), includes sourcemaps, and copies `main.js` to `test-vault/.obsidian/plugins/quartz-syncer/`. If the build fails, fix the build error first.

Do NOT use `npm run build` (production) for verification — it does not copy to the test vault and strips the `__DEV__` flag.

### Step 2: Reload plugin

Build alone does NOT update the running instance. You must reload:

```bash
obsidian eval code="(async()=>{await app.plugins.disablePlugin('quartz-syncer');await new Promise(r=>setTimeout(r,1000));await app.plugins.enablePlugin('quartz-syncer')})()" 2>/dev/null
```

Wait 3 seconds after this command, then verify the plugin loaded:
```bash
sleep 3 && obsidian eval code="typeof window.__QS__" 2>/dev/null
```
Expected: `=> object`. If `=> undefined`, the facade didn't mount — check that the dev build was used.

### Step 3: Health check

```bash
obsidian eval code="JSON.stringify(window.__QS__.assert('health.core'))" 2>/dev/null
```

Expected: `{"pass":true,"details":{...}}`. If `pass` is `false`, the plugin failed to initialize — check `details` for the reason.

### Step 4: Snapshot

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot())" 2>/dev/null
```

Inspect the snapshot for anomalies:
- `plugin.loaded` should be `true`
- `engine.running` should be `true`
- `statusBar.state` should be `"ready"` or `"compiling"` (not `"error"`)
- `errors.count` should be `0`

### Step 5: Check for errors

```bash
obsidian dev:errors 2>/dev/null
obsidian dev:console level=error 2>/dev/null
```

If errors are present, investigate. Use the event buffer for context:

```bash
obsidian eval code="JSON.stringify(window.__QS__.events.tail(10))" 2>/dev/null
```

### Step 6: Area-specific verification

Based on what was changed:

**Compiler/frontmatter changes:** Refresh status and check file counts.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()" 2>/dev/null
obsidian eval code="JSON.stringify(window.__QS__.snapshot().publishStatus)" 2>/dev/null
```

**UI/view changes:** Open the affected modal, verify DOM, take screenshot.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
sleep 2
obsidian dev:dom selector='[data-qs="pub-center"]' total 2>/dev/null
obsidian dev:screenshot path=/tmp/verify.png 2>/dev/null
```

**Settings changes:** Verify settings are readable.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'settings.get',params:{key:'gitRemoteUrl'}});console.log(JSON.stringify(r))})()" 2>/dev/null
```

**Git/connection changes:** Test the connection.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'connection.test'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

**Quartz Hub changes:** Open the Hub and verify.
```bash
obsidian command id=quartz-syncer:open-hub 2>/dev/null
sleep 2
obsidian dev:dom selector='[data-qs="hub"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="hub-action"]' total 2>/dev/null
obsidian dev:screenshot path=/tmp/hub-verify.png 2>/dev/null
```

## MUST DO

- Always append `2>/dev/null` to all `obsidian` CLI commands.
- Always build AND reload — build alone doesn't update the running instance.
- Always health-check after reload — a successful build doesn't guarantee successful initialization.
- Always use the IIFE pattern for async facade calls.
- Always wait after operations (3s after reload, 2s after modal open).
- Always verify actions took effect — follow up a click with a DOM query or screenshot.
- Parse all JSON responses — don't assume success. Check `pass` or `success` fields.
- If health check fails, collect a failure bundle before attempting fixes.

## MUST NOT DO

- Do NOT omit `2>/dev/null` — GTK warnings will pollute output parsing.
- Do NOT skip the reload step — Obsidian caches the old plugin code until disabled/enabled.
- Do NOT assume the plugin loaded correctly just because the build succeeded.
- Do NOT use `await` at the top level of `obsidian eval` — it loses return values. Use the IIFE pattern.
- Do NOT set input `.value` without `dispatchEvent(new Event('input', { bubbles: true }))` — event listeners won't fire.
- Do NOT modify code and re-verify without rebuilding AND reloading.

## Failure Bundle

When something goes wrong, collect all diagnostic data before investigating:

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot())" 2>/dev/null
obsidian eval code="JSON.stringify(window.__QS__.events.tail(20))" 2>/dev/null
obsidian dev:errors 2>/dev/null
obsidian dev:console level=error 2>/dev/null
obsidian dev:screenshot path=/tmp/failure.png 2>/dev/null
```
