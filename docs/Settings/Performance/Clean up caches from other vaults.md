---
title: Clean up caches from other vaults
description: Review and reclaim cache databases left behind by other vaults, renamed vaults, and remotes you no longer publish to.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: n/a
---

This is a button, not a toggle. It opens a dialog that lists cache databases Quartz Syncer believes no longer belong to anything, and lets you delete them after reviewing the list.

## Why these exist

Obsidian shares its browser storage across an entire installation, so Quartz Syncer scopes each cache to a specific vault and destination. That scoping is what stops two vaults publishing to the same remote from overwriting each other's work, or one vault being served another's compiled output.

The trade-off is that caches can become stranded. A database is left behind when you:

- delete a vault, or rename its folder
- stop publishing to a remote, or change branch
- upgrade across a version that changed how caches are named

Nothing breaks when this happens — the stranded databases are simply never read again. They just take up disk space.

## Using it

1. Open `Settings` > `Quartz Syncer` > `Performance`.
2. Click **Clean up caches from other vaults**.
3. The dialog surveys your storage and lists the exact database names it found.
4. Review the list, then either **Cancel**, which deletes nothing, or **Delete N database(s)**, which deletes exactly what is listed.

Afterwards it reports how many databases were reclaimed and any it could not remove.

> [!NOTE] Your notes are never involved
>
> These databases hold derived data only — compiled output, hashes, cached repository trees. Deleting them cannot lose a note. A vault still in use rebuilds its cache the next time you open it.

> [!IMPORTANT] Nothing is deleted without confirmation
>
> The survey never deletes as a side effect of running, and the dialog never deletes anything you have not seen listed. Your current vault's live caches and the clone for your currently configured remote are excluded from the survey entirely.

## From the CLI

```bash
# Survey only — lists exact database names, deletes nothing
obsidian quartz-syncer:cache action=prune-foreign force dry-run

# Delete them
obsidian quartz-syncer:cache action=prune-foreign force
```

`force` is required even for the dry run. See [[Guides/CLI#quartz-syncercache|the CLI guide]].

## Related

- [[Enable caching]] — turns caching on or off entirely.
- `obsidian quartz-syncer:cache action=prune` — the conservative sweep, which only removes outdated entries within this vault's own caches and needs no confirmation.
