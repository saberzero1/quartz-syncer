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
- The plugin must have operability enabled (automatic in dev builds via `__DEV__` flag).
- The Obsidian CLI must be registered and working (`obsidian eval code="1+1"` should return `=> 2`).
- Console capture requires the debugger: run `obsidian dev:debug on` once per Obsidian session before using `dev:console`.

## Workflow

### Step 1: Build and deploy to test vault

```bash
npm run build:dev
```

This builds with `__DEV__=true` (facade mounts automatically), includes sourcemaps, and copies `main.js` to `test-vault/.obsidian/plugins/quartz-syncer/`. If the build fails, fix the build error first.

Do NOT use `npm run build` (production) for verification — it does not copy to the test vault and strips the `__DEV__` flag.

### Step 2: Reload plugin

```bash
obsidian eval code="(async()=>{await app.plugins.disablePlugin('quartz-syncer');await app.plugins.enablePlugin('quartz-syncer')})()"
```

Wait 3 seconds for initialization to complete. Verify the plugin loaded:
```bash
obsidian eval code="typeof window.__QS__"
```
Expected: `=> object`. If `=> undefined`, the facade didn't mount — check that `ENABLE_DEVELOPER_TOOLS` is `true` or use a dev build.

### Step 3: Health check

```bash
obsidian eval code="JSON.stringify(window.__QS__.assert('health.core'))"
```

Expected: `{"pass":true,"details":{...}}`. If `pass` is `false`, the plugin failed to initialize — check `details` for the reason.

### Step 4: Snapshot

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot())"
```

Inspect the snapshot for anomalies:
- `plugin.loaded` should be `true`
- `engine.running` should be `true`
- `statusBar.state` should be `"ready"` or `"compiling"` (not `"error"`)
- `errors.count` should be `0`

### Step 5: Check for errors

```bash
obsidian dev:errors
```

For console messages (requires `obsidian dev:debug on` to have been run first in this session):
```bash
obsidian dev:console level=error
```

If errors are present, investigate. Use the event buffer for context:

```bash
obsidian eval code="JSON.stringify(window.__QS__.events.tail(10))"
```

### Step 6: Area-specific verification

Based on what was changed:

**Compiler/frontmatter changes:** Refresh status and check file counts.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()"
obsidian eval code="JSON.stringify(window.__QS__.snapshot().publishStatus)"
```

**UI/view changes:** Open the affected modal and check DOM.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()"
obsidian dev:dom selector='[data-qs="pub-center"]' total
obsidian dev:screenshot path=/tmp/verify.png
```

**Settings changes:** Verify settings are readable.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'settings.get',params:{key:'gitRemoteUrl'}});console.log(JSON.stringify(r))})()"
```

**Git/connection changes:** Test the connection.
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'connection.test'});console.log(JSON.stringify(r))})()"
```

## MUST DO

- Always build before reloading — Obsidian loads the compiled `main.js`, not source files.
- Always health-check after reload — a successful build doesn't guarantee successful initialization.
- Always check `dev:console level=error` — some errors only appear in the renderer console.
- Parse all JSON responses — don't assume success. Check `pass` or `success` fields.
- If health check fails, collect a failure bundle before attempting fixes.

## MUST NOT DO

- Do NOT skip the reload step — Obsidian caches the old plugin code until disabled/enabled.
- Do NOT assume the plugin loaded correctly just because the build succeeded.
- Do NOT ignore errors in `dev:console` — they may indicate runtime issues not caught by TypeScript.
- Do NOT modify code and re-verify without rebuilding first.

## Failure Bundle

When something goes wrong, collect all diagnostic data before investigating:

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot())"
obsidian eval code="JSON.stringify(window.__QS__.events.tail(20))"
obsidian dev:console level=error
obsidian dev:errors
obsidian dev:screenshot path=/tmp/failure.png
```
