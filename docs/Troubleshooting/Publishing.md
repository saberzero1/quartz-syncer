---
title: Publishing
description: Troubleshooting issues with publishing, publish destinations, and the Publication Center.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

## The Publication Center is empty

Quartz Syncer shows nothing until notes are marked publishable. Check, in order:

1. **Does the note have the publish property?** It needs the [[Publish key|publish property]] set to `true`. Obsidian's checkbox property type writes `true` when ticked.
2. **Is the note inside your [[Vault root folder|vault root folder]]?** Nothing outside it is ever considered.
3. **Is it a Markdown file?** Only Markdown notes are publish candidates. `.canvas` and `.base` files additionally need [[Canvas]] or [[Bases]] enabled.
4. **Has background compilation finished?** The [[Settings/index#Status bar|status bar]] shows `Quartz Syncer: ready` when it has.

To publish everything without marking notes individually, see [[All notes publishable by default]].

## "No repository configured"

No publish destination resolves. The [[Settings/Overview/index|Overview]] settings screen shows a button that fixes it, and the [[Settings/index#Status bar|status bar]] reads `Quartz Syncer: not configured`.

Either run the [[Setup Guide#Quick setup with the onboarding wizard|setup wizard]] (desktop), or `Quartz Syncer: Manual setup` (anywhere).

## "Publish target is the remote, but no git remote URL is set"

[[Publish to]] is set to **Remote repository** while [[Remote URL]] is empty. Two fixes:

- Set a [[Remote URL|remote URL]], or
- Switch [[Publish to]] back to **Local folder**, if you have a [[Local Quartz repo path|local checkout]].

Quartz Syncer deliberately refuses to pick the other destination for you.

## "Publish target is the local folder, but no local Quartz repo path is set"

The mirror image. Either set [[Local Quartz repo path]] — the [[Guides/Quartz Hub#Setup tab|Quartz Hub]] can link or clone one — or switch [[Publish to]] back to **Remote repository**.

## "Local publishing is desktop only"

You selected **Local folder** but opened the vault on mobile. If a remote is configured, Quartz Syncer publishes to the remote on this device and tells you so. If not, set up a remote.

Your local path is preserved either way, so desktop keeps publishing locally. See [[Publish to#On mobile]].

## Publishing starts, then fails

A destination can resolve and still not work. The [[Settings/Overview/index|Overview]] warns about these separately:

| Warning | Fix |
| --- | --- |
| No branch is set | Set [[Branch]]. It is required for both destinations. |
| No token is stored | Save an [[Access token]]. |
| The local path does not exist | Correct [[Local Quartz repo path]]. |
| The local path is not a directory | Point it at the repository folder, not a file inside it. |
| No Quartz config found at the local path | Confirm the path is a Quartz checkout; it should contain a `quartz.config.*` file. |

For authentication failures specifically, see [[Troubleshooting/Authentication|authentication troubleshooting]].

## The Delete button is greyed out

Delete is enabled only when your selection contains something that exists at the destination. **Changed** and **Unpublished** notes are deliberately not deletable.

To unpublish a note, select it under **Published**. To clear out a note you already deleted from your vault, select it under **Deleted**. See [[Usage Guide#The Delete button]].

## Selecting a published note and pressing Publish does nothing

That is correct behaviour. **Published** notes are already in sync, so the Publish button skips them.

In v1 and early v2 docs, checking a published note queued it for *removal*. That is now the separate Delete button. See [[Usage Guide#Unpublishing a note]].

## The publish status looks wrong after changing settings

Publish status is a comparison against one destination's file tree, and it is cached per destination. Changing [[Publish to]], [[Remote URL]] or [[Branch]] invalidates that cache and triggers a recomputation, which can take a moment.

If it still looks stale, refresh it explicitly:

```bash
obsidian quartz-syncer:cache action=tree-refresh
obsidian quartz-syncer:status
```

## Media is missing from my site

- Media is published alongside the notes that link it. Publishing a note selects its media automatically — but if you published before the link existed, publish the note again.
- Media referenced only from a Quartz template or component, not from a published note, is not tracked. With [[Automatically clean orphaned media]] enabled, such files will be deleted as orphans.
- Check what the destination actually has: `obsidian quartz-syncer:media action=list`.

## Everything republishes on every publish

Quartz Syncer compares content hashes, so unchanged files should be skipped. If everything looks changed:

- **Did you recently upgrade to 2.0.11 or later?** Caches became per-vault, so the first publish after upgrading performs a one-time re-clone and recompile. This happens once.
- **Dynamic notes always recompile.** Notes with Dataview or Datacore queries are recompiled on every operation, because their output depends on the rest of the vault. They are only *published* if the output actually changed.
- **Check for a hash mismatch**: `obsidian quartz-syncer:inspect target=hashes`.

## My repository is too large to read

If the Git server cannot serve a file list on its own, the only alternative is downloading the whole repository, which Quartz Syncer refuses by default to avoid exhausting memory. See [[Allow large full clones]].

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
