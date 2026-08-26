---
name: debug-obsidian
description: Debug and investigate plugin issues in a running Obsidian instance — collect diagnostic data, inspect state, trace events, and identify root causes via the operability facade.
triggers:
    - debug
    - investigate
    - something broke
    - error
    - not working
    - broken
    - diagnose
argument-hint: '[symptom-description]'
---

# Debug Obsidian Skill

## Purpose

When the plugin isn't behaving correctly in Obsidian, systematically collect diagnostic data, inspect internal state, and trace events to identify the root cause. Uses the operability facade, console capture, and DOM inspection.

## Prerequisites

- Obsidian must be running.
- Plugin should be built with `npm run build:dev` (enables facade via `__DEV__` flag).
- Console capture requires `obsidian dev:debug on` (once per session).
- If `window.__QS__` is undefined, the plugin may be running a production build without `ENABLE_DEVELOPER_TOOLS`. Rebuild with `npm run build:dev` and reload. If still unavailable, fall back to direct `app.plugins.plugins['quartz-syncer']` access for raw state inspection.

## When to Activate

Activate when:
- The plugin produces errors after a code change
- A feature doesn't work as expected in the running instance
- The health check fails after reload
- The status bar shows "error" state
- Publish operations fail
- UI doesn't render or renders incorrectly

## Workflow

### Step 1: Collect failure bundle

Always start by capturing the current state before any investigation changes it:

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot())"
obsidian eval code="JSON.stringify(window.__QS__.events.tail(20))"
obsidian dev:console level=error
obsidian dev:errors
obsidian dev:screenshot path=/tmp/debug.png
```

Save these outputs — they're the baseline for investigation.

### Step 2: Analyze the snapshot

Parse the snapshot JSON and check:

- `plugin.loaded` — `false` means the plugin failed to initialize
- `engine.running` — `false` means the background engine didn't start
- `statusBar.state` — `"error"` means something went wrong
- `errors.count` — non-zero means errors occurred
- `errors.latest` — the most recent error message
- `settings.configured` — `false` means no repo configured
- `publisher.available` — `false` means Publisher couldn't be created
- `publisher.lastError` — the last publisher error

### Step 3: Analyze events

Parse the event buffer and look for:

- `error.occurred` events — check `payload.error` and `payload.action`
- `compilation.failed` events — check `payload.path` and `payload.error`
- `publish.failed` / `delete.failed` — check `payload.error`
- `engine.stopped` without `engine.started` — abnormal shutdown

Events are ordered by cursor (monotonically increasing). Most recent events are at the end of the `tail()` result.

### Step 4: Check console errors

```bash
obsidian dev:console level=error
```

Look for:
- Stack traces — identify the source file and line number
- `TypeError` — null/undefined access, often indicates initialization order issues
- `NetworkError` — Git/HTTP failures
- Plugin-specific errors prefixed with `Quartz Syncer:`

### Step 5: Targeted investigation

Based on what Step 2-4 revealed:

**Plugin won't load:**
```bash
obsidian eval code="JSON.stringify(typeof window.__QS__)"
# "undefined" means facade didn't mount — check if ENABLE_DEVELOPER_TOOLS is set
obsidian eval code="JSON.stringify(app.plugins.plugins['quartz-syncer']?.settings?.ENABLE_DEVELOPER_TOOLS)"
```

**Publisher unavailable:**
```bash
obsidian eval code="JSON.stringify(app.plugins.plugins['quartz-syncer']?.settings?.gitRemoteUrl)"
obsidian eval code="JSON.stringify(app.plugins.plugins['quartz-syncer']?.settings?.gitAuthType)"
```

**Compilation failures:**
```bash
obsidian eval code="JSON.stringify(window.__QS__.events.tail(50).filter(e => e.type === 'compilation.failed'))"
```

**Connection failures:**
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'connection.test'});console.log(JSON.stringify(r))})()"
```

**UI not rendering:**
```bash
obsidian dev:dom selector='[data-qs="pub-center"]' total
obsidian dev:dom selector='[data-qs="statusbar"]' total
obsidian dev:dom selector='.modal' total
```

**Stale status:**
```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot().publishStatus?.stale)"
# If true, status needs refresh:
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()"
```

### Step 6: Wait for conditions

Use `waitFor` to monitor async conditions:

```bash
# Wait for engine to become idle (compilation to finish)
obsidian eval code="(async()=>{const r=await window.__QS__.waitFor('engine.idle',{},10000);console.log(JSON.stringify(r))})()"

# Wait for no errors since a cursor
obsidian eval code="(async()=>{const r=await window.__QS__.waitFor('errors.none',{cursor:0},5000);console.log(JSON.stringify(r))})()"
```

### Step 7: Mobile-specific debugging

```bash
# Enable mobile emulation
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'env.emulateMobile',params:{enabled:true,confirm:true}});console.log(JSON.stringify(r))})()"

# Take screenshot in mobile mode
obsidian dev:screenshot path=/tmp/mobile-debug.png

# Check if desktop-only features are properly hidden
obsidian dev:dom selector='[data-qs="pub-center"]' total

# Disable emulation when done
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'env.emulateMobile',params:{enabled:false,confirm:true}});console.log(JSON.stringify(r))})()"
```

## MUST DO

- Always collect the failure bundle FIRST — before any investigation that might change state.
- Parse JSON responses systematically — don't eyeball large outputs.
- Check BOTH the facade (`window.__QS__`) AND the console (`dev:console`) — some errors only appear in one.
- If `window.__QS__` is undefined, fall back to direct `app.plugins.plugins['quartz-syncer']` access.
- Report findings with specific error messages, event cursors, and file paths.

## MUST NOT DO

- Do NOT start changing code before understanding the root cause.
- Do NOT ignore console errors even if the facade reports no errors — they may come from different sources.
- Do NOT assume the plugin is broken if the facade is unavailable — check if ENABLE_DEVELOPER_TOOLS is enabled.
- Do NOT run destructive operations (publish, delete) while investigating — use dry-run mode instead.
