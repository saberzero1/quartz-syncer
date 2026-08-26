---
name: verify-publish
description: End-to-end publish verification — refresh status, publish files, verify the result, and confirm status changes via the operability facade.
triggers:
    - verify publish
    - test publish
    - publish flow
    - does publish work
    - end to end
argument-hint: '[file-path]'
---

# Verify Publish Skill

## Purpose

Verify the full publish pipeline works end-to-end: status computation, file compilation, Git push, and status update. Uses the operability facade for structured verification rather than manual Obsidian interaction.

## When to Activate

Activate when:
- Changes were made to Publisher, PublishStatusManager, BundledGitBackend, or SyncerPageCompiler
- Changes were made to the publication center UI that affect the publish flow
- An agent needs to confirm a publish operation completed successfully
- Testing after Git/auth configuration changes

## Prerequisites

- Obsidian must be running with the test vault open.
- Plugin must be built with `npm run build:dev` (copies to test vault, enables facade via `__DEV__` flag).
- Operability facade must be available (`obsidian eval code="typeof window.__QS__"` returns `=> object`).
- Console capture requires `obsidian dev:debug on` (once per session).
- Plugin must be loaded and healthy (`assert('health.core')` passes).
- Repository must be configured (`assert('health.configured')` passes).
- At least one file must be marked with `publish: true` in frontmatter.

## Workflow

### Step 1: Verify prerequisites

```bash
obsidian eval code="JSON.stringify(window.__QS__.assert('health.core'))"
obsidian eval code="JSON.stringify(window.__QS__.assert('health.configured'))"
```

Both must return `{"pass":true,...}`. If `health.configured` fails, the repo is not set up — use `obsidian quartz-syncer:config` to configure.

### Step 2: Refresh publish status

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()"
```

Expected: `{"success":true}`. Then check the snapshot:

```bash
obsidian eval code="JSON.stringify(window.__QS__.snapshot().publishStatus)"
```

This shows counts of unpublished, changed, published, deleted files. If `unpublished` and `changed` are both 0, there's nothing to publish.

### Step 3: Test connection

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'connection.test'});console.log(JSON.stringify(r))})()"
```

Expected: `{"success":true,"data":{"readAccess":true,"writeAccess":true}}`. If write access is false, credentials may be wrong.

### Step 4: Publish

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.publish',params:{message:'Test publish',confirm:true}});console.log(JSON.stringify(r))})()"
```

Expected: `{"success":true,"data":{"filesPublished":N,"filesDeleted":0,...}}`. If success is false, check the error message.

### Step 5: Verify result

Refresh status again and confirm file counts changed:

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'status.refresh'});console.log(JSON.stringify(r))})()"
obsidian eval code="JSON.stringify(window.__QS__.snapshot().publishStatus)"
```

The `unpublished` and `changed` counts should have decreased (or be 0). The `published` count should have increased.

### Step 6: Check events

```bash
obsidian eval code="JSON.stringify(window.__QS__.events.tail(5))"
```

Look for `publish.completed` event with `commitSha` in the payload. This confirms the Git push succeeded.

### Step 7: Check for errors

```bash
obsidian dev:console level=error
```

No errors should be present.

## Dry-run Alternative

To test the pipeline without actually pushing to the remote:

```bash
obsidian quartz-syncer:publish dry-run
```

This uses the CLI dry-run flag which shows what would be published without making changes.

## MUST DO

- Always refresh status before and after publish — status is cached and must be explicitly refreshed.
- Always check the `success` field in action results — don't assume success.
- Always test connection before publish — avoids wasting time on auth failures.
- Check events after publish for the `commitSha` — this confirms the push actually reached the remote.

## MUST NOT DO

- Do NOT publish without checking `health.configured` first — it will fail with an unclear error.
- Do NOT skip the post-publish status refresh — without it, the snapshot still shows stale data.
- Do NOT run publish in rapid succession — wait for each operation to complete before starting another.
